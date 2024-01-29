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
    const readValue: FieldValueReader<TStrict> = (r) => readMessageValue(r, undefined);
    return {defVal, readMessageValue, readValue, read, wireType: WireType.LengthDelim};
}

export function createMessage<TStrict>(fields: ReadonlyArray<MessageFieldDef>): MessageFieldType<TStrict> {
    const defVal = messagesDef;
    const readMessageValue = makeMessageValueReader<TStrict>(fields);
    const read = makeMessageReader(readMessageValue);
    const readValue: FieldValueReader<TStrict> = (r) => readMessageValue(r, undefined);
    return {defVal, readMessageValue, readValue, read, wireType: WireType.LengthDelim}
}

export type MessageFieldDef = [number, string, Deferrable<FieldType<any> | OneofFieldType<any>>]

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

export type MessageValueReader<T> = (r: Readable, prev?: T) => T

export function makeMessageValueReader<T>(fields: readonly MessageFieldDef[]): MessageValueReader<T> {
    // the following code is run once per type of message and sets up some maps and a template
    const create = once(() => {
        const numberToField: MessageFieldDef[] = []
        const oneofs = new Map<string, Set<number>>();
        const template: any = {};
        for (const field of fields) {
            const [number, name, type] = field;
            numberToField[number] = field;
            const fieldType = realize(type);
            const {defVal} = fieldType;
            const def = defVal();
            const oneof = "oneof" in fieldType ? fieldType.oneof : undefined;
            if (oneof) {
                const set = getOrAdd(oneofs, oneof, () => new Set());
                set.add(number);
            }
            else {
                template[name] = def;
            }
        }
        return {template, numberToField, oneofs};
    });
    return (r, prev) => {
        const {template, numberToField, oneofs} = create();
        const m: any = {...template, ...prev};
        for (;;) {
            const t = R.tag(r);
            if (t === undefined)
                break;
            const number = R.fieldFromTag(t);
            const wtype = R.wireTypeFromTag(t);
            const field = numberToField[number];
            if (field === undefined) {
                const raw = R.skip(r, wtype);
                // TODO: how to handle unknown
                //unknown.push([number, raw]);
                continue;
            }
            const type = realize(field[2]);
            const result = type.read(r, wtype, number, () => m[field[1]]);
            if ("oneof" in type) {
                const oneofResult = result as OneOfValue;
                const {populated, value} = oneofResult;
                const oneof = oneofs.get(type.oneof)!;
                for (const option of oneof) {
                    if (option === populated) {
                        m[field[1]] = value;
                    }
                    else {
                        const name = numberToField[option][1];
                        delete m[name];
                    }
                }
            }
            else {
                if (result instanceof Error)
                    throw result;
                m[field[1]] = result;
    
            }
        }
        return m;
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
