import { realize, RepeatableFieldType, Deferrable, FieldType, OneofFieldType, OneOfValue, makeDecoder } from './field-types';
import { makeDelimitedWriter, makeFieldWriter, ValueWriter, makeEncoder } from "./write-field";
import { FieldValueReader, FieldReader, WireType, Readable, NestedWritable } from './types';
import * as R from "./read-value";

import { once } from './helpers';
import { isUndefined } from './isundefined';

// a basic message codec is the bare minimum requirement to encode and decode a message
export type TypeCodecBasic<Strict extends Value, Value, Default> = {
    defVal: () => Default,
    isDef: (v: Strict | Value | Default) => v is Default,
    /**
     * Write all non-default fields
     * @param {NestedWritable} writable - Target writable
     * @param {Value} value - instance of message
     */
    writeContents: ValueWriter<Value>,
    readMessageValue: MessageValueReader<Strict>,
    // TODO: implement create()
    // create() can be used to:
    //   normalize, copy, modify
    create: (value: Value, merge?: Value) => Strict,
}

// a message codec can encode and decode a message in multiple ways
export type TypeCodec<Strict extends Value, Value, Default>
    = TypeCodecBasic<Strict, Value, Default>
    & {
    /**
     * Write all non-default fields into a length-prefixed block
     * @param {NestedWritable} writable - Target writable
     * @param {Value} value - instance of message
     */
    writeValue: ValueWriter<Value>,
    /**
     * Write all non-default fields into a length-prefixed block with a tag
     * @param {NestedWritable} writable - Target writable
     * @param {Value} value - instance of message
     * @param {number} field - number of field
     * @returns {boolean} - true if it wrote anything
     */
    write: (w: NestedWritable, value: Value | Default, field?: number) => boolean,
    /**
     * Convert a message instance to its encoded form
     * @param {Value} value - instance of message
     * @returns {Uint8Array} - the encoded form of the message
     */
    readValue: FieldValueReader<Strict>,
    read: FieldReader<Strict, undefined>,
    encode: (v: Value) => Uint8Array,
    decode: (bytes: Uint8Array) => Strict,
}

// a message definition contains a definition of the fields of the message plus the codec to encode/decode it
export type MessageDef<Strict extends Value, Value>
    = TypeCodec<Strict, Value, undefined>
    & MessageDefRaw<Strict, Value>
    & {
        wireType: WireType.LengthDelim,
    }

export type MessageFieldType<TStrict> = RepeatableFieldType<TStrict, undefined> & {readMessageValue: MessageValueReader<TStrict>}

type MessageDefRaw<Strict extends Value, Value> = {
    writeContents: ValueWriter<Value>,
    fields: readonly MessageFieldDef[],
}

export function extendBasicCodec<TStrict extends TValue, TValue, Default>(basic: TypeCodecBasic<TStrict, TValue, Default>): TypeCodec<TStrict, TValue, Default> {
    const writeValue = makeDelimitedWriter(basic.writeContents);
    const readValue = (r: Readable) => basic.readMessageValue(r, undefined);
    const read = makeMessageReader(readValue);
    const write = makeFieldWriter(writeValue, basic.isDef);
    const encode = makeEncoder(basic.writeContents);
    const decode = makeDecoder(readValue);
    return {...basic, writeValue, readValue, read, write, encode, decode};
}

export function define<Strict extends Value, Value>(placeholder: MessageDef<Strict, Value>, raw: MessageDefRaw<Strict, Value>): void {
    const {writeContents, fields} = raw;
    const writeValue = makeDelimitedWriter(writeContents);
    const write = makeFieldWriter(writeValue, isUndefined);
    const encode = makeEncoder<Value>(writeContents);
    const readMessageValue = makeMessageValueReader<Strict>(fields);
    const {readValue, defVal, read} = message(() => ({readMessageValue}));
    const isDef = isUndefined; // Note: the seeming contradiction here is that "Def" means "default" not "defined".
    const wireType = WireType.LengthDelim;
    const decode = makeDecoder(readValue);
    const create: (value: Value, merge?: Value) => Strict = undefined as any
    const complete: MessageDef<Strict, Value> = {writeContents, writeValue, write, encode, fields, readMessageValue, readValue, defVal, isDef, read, wireType, decode, create};
    Object.assign(placeholder, complete);
}

const messagesDef = () => undefined;

export function message<TStrict>(getMessageDef: () => {readMessageValue: MessageValueReader<TStrict>}): MessageFieldType<TStrict> {
    const defVal = messagesDef;
    getMessageDef = once(getMessageDef);
    const readMessageValue: MessageValueReader<TStrict> = (r, prev) => getMessageDef().readMessageValue(r, prev);
    const read = makeMessageReader(readMessageValue);
    const readValue: FieldValueReader<MessageImpl<TStrict>> = (r) => readMessageValue(r, undefined);
    return {defVal, readMessageValue, readValue, read, wireType: WireType.LengthDelim};
}

export function createMessage<TStrict>(fields: ReadonlyArray<MessageFieldDef>): MessageFieldType<TStrict> {
    const defVal = messagesDef;
    const readMessageValue = makeMessageValueReader<TStrict>(fields);
    const read = makeMessageReader(readMessageValue);
    const readValue: FieldValueReader<MessageImpl<TStrict>> = (r) => readMessageValue(r, undefined);
    return {defVal, readMessageValue, readValue, read, wireType: WireType.LengthDelim}
}

export type MessageFieldDef = [number, string, Deferrable<FieldType<any> | OneofFieldType<any>>]

interface VTable {
    _vtable: readonly any[];
    _unknown: readonly UnknownField[];
}

type UnknownField = readonly [number, Uint8Array];

function getOrAdd<K,V>(map: Map<K, V>, key: K, add: () => V): V {
    const existing = map.get(key);
    if (existing === undefined) {
        const set = add();
        map.set(key, set);
        return set;
    }
    else {
        return existing;
    }
}

export type MessageImpl<T> = T & VTable & {
    new(vt: VTable): MessageImpl<T>
}

export type MessageValueReader<T> = (r: Readable, prev?: MessageImpl<T> | T) => MessageImpl<T>

export function makeMessageValueReader<T>(fields: readonly MessageFieldDef[]): MessageValueReader<T> {
    // the following code is run once per type of message and sets up a function that can be called for every instance of the message

    // all fresh vtables are a clone of the template
    // the template vtable is populated with the defaults for all fields
    const MessageImpl = function(this: T & VTable, vt: VTable) {
        Object.defineProperty(this, "_vtable", {value: vt._vtable, enumerable: false})
        Object.defineProperty(this, "_unknown", {value: vt._unknown, enumerable: false})
    } as any as MessageImpl<T>;
    
    const create = once(() => {
        const numberToVtableIndex: number[] = [];
        const numberToField: MessageFieldDef[] = []
        const oneofToVtableIndex: Map<string, number> = new Map();

        const vtableTemplate: any[] = [];
        for (const field of fields) {
            const [number, name, type] = field;
            numberToField[number] = field;
            const fieldType = realize(type);
            const {defVal} = fieldType;
            const def = defVal();
            if ("oneof" in fieldType) {
                const {oneof} = fieldType;
                const vtableIndex = getOrAdd(oneofToVtableIndex, oneof, () => {
                    const vtableIndex = vtableTemplate.length;
                    vtableTemplate.push(def);
                    return vtableIndex;
                });
                numberToVtableIndex[number] = vtableIndex;
                Object.defineProperty(MessageImpl.prototype, name, {
                    get: function() { 
                        const ov: OneOfValue = this._vtable[vtableIndex];
                        return ov?.populated === number ? ov.value : fieldType.oneofDefVal();
                    },
                    enumerable: true,
                })
            }
            else {
                const vtableIndex = vtableTemplate.length;
                vtableTemplate.push(def);
                numberToVtableIndex[number] = vtableIndex;
                // the getter for each field is defined here
                // each field value is retrieved from the vtable at the same index it is declared in the fields array
                Object.defineProperty(MessageImpl.prototype, name, {
                    get: function() { return this._vtable[vtableIndex]; },
                    enumerable: true,
                })
            }
        }

        for (const oneof of oneofToVtableIndex) {
            const [name, index] = oneof;
            Object.defineProperty(MessageImpl.prototype, `${name}Case`, {
                get: function() {
                    return numberToField[this._vtable[index]?.populated]?.[1]
                },
                enumerable: false,
            })
        }

        Object.defineProperty(MessageImpl.prototype, "toJSON", {enumerable: false, value: function() {
            const obj: any = {};
            for (const name in this)
                obj[name] = this[name];
            return obj;
        }})

        const template: VTable = {_vtable: vtableTemplate, _unknown: []};
        const vtableReader = makeMessageVTableReader(numberToField, numberToVtableIndex);
        return {template, vtableReader};
    });
    return (r, prev) => {
        const {template, vtableReader} = create();
        const start = getVtable(prev) || template;
        const vtable = vtableReader(r, start)
        const instance = new MessageImpl(vtable);
        return instance;
    }
}

function getVtable<TStrict>(msg: MessageImpl<TStrict> | TStrict | undefined): VTable | undefined {
    // TODO: right now, you cannot use a previous message's state as a starting point when reading unless it is a MessageImpl (with a vtable)
    //       which they always will be when decoding from wire format
    //       and so we satisfy the requirement when decoding that a message can be broken into muliple blocks within the wire format and these will be merged together
    //       but the resulting message value reader acts as though it can take any TStrict in prev() and it currently cannot because we have not implemented a way to go from strict back to vtable below
    //       if we implement that, then this will also be possible, but so far there's no actual use case
    if (!msg)
        return undefined;
    if (!(typeof msg === "object"))
        return undefined;
    if (!("_vtable" in msg))
        return undefined;
    return msg as any as VTable;
}

type VTableReader = (r: Readable, template: VTable) => VTable

function makeMessageVTableReader(numberToField: readonly MessageFieldDef[], numberToVtableIndex: readonly number[]): VTableReader {
    return (r, template) => {
        const vtable = template._vtable.slice();
        const unknown = template._unknown.slice();
        for (;;) {
            const t = R.tag(r);
            if (t === undefined)
                break;
            const number = R.fieldFromTag(t);
            const wtype = R.wireTypeFromTag(t);
            const field = numberToField[number];
            if (field === undefined) {
                // this field isn't something we had in our proto, so just stash the raw bytes
                unknown.push([number, R.skip(r, wtype)]);
                continue;
            }
            const type = realize(field[2]);
            const index = numberToVtableIndex[number];
            const result = type.read(r, wtype, number, () => vtable[index]);
            if (result instanceof Error)
                throw result;
            vtable[index] = result;
        }
        return {_vtable: vtable, _unknown: unknown}
    }

}

export function makeMessageReader<TStrict>(contentReader: MessageValueReader<TStrict>): FieldReader<TStrict, undefined> {
    return (readable, wt, number, prev) => {
        if (wt !== WireType.LengthDelim) {
            return new Error(`Invalid wire type for message: ${wt}`);
        }
        const sub = R.sub(readable);
        const pval = prev();
        return contentReader(sub, pval);
    }
}
