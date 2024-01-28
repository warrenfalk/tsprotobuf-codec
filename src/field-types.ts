import { FieldReader, WireType, Readable } from "./types";
import * as R from "./read-value";
import { createMessage } from './messages';
import { fromBytes } from './reader';
import { Instant, Duration } from "@js-joda/core";

export type FieldType<TVal, TDef = TVal> = {
    defVal: () => TDef,
    read: FieldReader<TVal, TDef>,
}

export type Deferrable<T> = Exclude<T, Function> | (() => Exclude<T, Function>);

export function realize<T>(deferrable: Deferrable<T>): T {
    return "apply" in deferrable ? deferrable() : deferrable;
}

export type RepeatableFieldType<TVal, TDef = TVal> = FieldType<TVal, TDef> & {
    wireType: WireType,
    readValue: FieldValueReader<TVal>,
}

export type OneofFieldType<TDef> = FieldType<OneOfValue, undefined> & {
    oneof: string,
    oneofDefVal: () => TDef
}

type FieldValueReader<TVal> = (r: Readable) => TVal;

function primitive<T>({name, def, wt, read}: {name: string, def: T, wt: WireType, read: FieldValueReader<T>}): RepeatableFieldType<T> {
    return {
        defVal: () => def,
        read: makePrimitiveFieldReader({name, wireType: wt, readValue: read}),
        wireType: wt,
        readValue: read,
    }
}

function makePrimitiveFieldReader<TVal>({name, wireType, readValue}: {name: string, wireType: WireType, readValue: (r: Readable) => TVal}): FieldReader<TVal> {
    return (r, wt, prev) => {
        if (wt != wireType) {
            R.skip(r, wt);
            return new Error(`Invalid wire type for ${name}: ${wt}`);
        }
        return readValue(r);
    }
}

function optional<T>(type: RepeatableFieldType<T, T>): RepeatableFieldType<T, undefined> {
    return {
        ...type,
        defVal: () => undefined,
        read(r, wt, number, prev) {
            return type.read(r, wt, number, type.defVal);
        },
    }
}

// The "maybe" are implemented with google's "wrapper" types which just wrap the values in a message with field 1 being of the base primitive type
function maybe<T>(type: RepeatableFieldType<T, T>): RepeatableFieldType<T, undefined> {
    const readMessageValue = (r: Readable, prev: T | undefined) => {
        let value: T = prev === undefined ? type.defVal() : prev;
        for (;;) {
            const t = R.tag(r);
            if (t === undefined) {
                break;
            }
            const number = R.fieldFromTag(t);
            if (number !== 1) {
                continue;
            }
            const wtype = R.wireTypeFromTag(t);
            const result = type.read(r, wtype, number, () => value);
            if (result instanceof Error)
                throw result;
            value = result;
        }
        return value
    }
    return {
        defVal: () => undefined,
        wireType: WireType.LengthDelim,
        readValue(r) { return readMessageValue(r, undefined)},
        read(r, wt, number, prev) {
            if (wt != WireType.LengthDelim) {
                R.skip(r, wt);
                return new Error(`Invalid wire type for wrapper (${wt})`);
            }
            const sub = R.sub(r);
            const pval = prev();
            return readMessageValue(sub, pval);
        },
    }
}

const emptyBytes = new Uint8Array(0);

export const bool              = primitive<boolean>({    name: "bool"              , def: false                  , wt: WireType.Varint      , read: R.bool              });
export const bytes             = primitive<Uint8Array>({ name: "bytes"             , def: emptyBytes             , wt: WireType.LengthDelim , read: R.bytes             });
export const double            = primitive<number>({     name: "double"            , def: 0                      , wt: WireType.Double      , read: R.double            });
export const fixed32           = primitive<number>({     name: "fixed32"           , def: 0                      , wt: WireType.Single      , read: R.fixed32           });
export const fixed64decimal    = primitive<string>({     name: "fixed64decimal"    , def: "0"                    , wt: WireType.Double      , read: R.fixed64decimal    });
export const fixed64decimalpad = primitive<string>({     name: "fixed64decimalpad" , def: "00000000000000000000" , wt: WireType.Double      , read: R.fixed64decimalpad });
export const fixed64hexpad     = primitive<string>({     name: "fixed64hexpad"     , def: "0000000000000000"     , wt: WireType.Double      , read: R.fixed64hexpad     });
export const float             = primitive<number>({     name: "float"             , def: 0                      , wt: WireType.Single      , read: R.float             });
export const int32             = primitive<number>({     name: "int32"             , def: 0                      , wt: WireType.Varint      , read: R.int32             });
export const int64decimal      = primitive<string>({     name: "int64decimal"      , def: "0"                    , wt: WireType.Varint      , read: R.int64decimal      });
export const sfixed32          = primitive<number>({     name: "sfixed32"          , def: 0                      , wt: WireType.Single      , read: R.sfixed32          });
export const sfixed64decimal   = primitive<string>({     name: "sfixed64decimal"   , def: "0"                    , wt: WireType.Double      , read: R.sfixed64decimal   });
export const sint32            = primitive<number>({     name: "sint32"            , def: 0                      , wt: WireType.Varint      , read: R.sint32            });
export const sint64decimal     = primitive<string>({     name: "sint64decimal"     , def: "0"                    , wt: WireType.Varint      , read: R.sint64decimal     });
export const string            = primitive<string>({     name: "string"            , def: ""                     , wt: WireType.LengthDelim , read: R.string            });
export const uint32            = primitive<number>({     name: "uint32"            , def: 0                      , wt: WireType.Varint      , read: R.uint32            });
export const uint64decimal     = primitive<string>({     name: "uint64decimal"     , def: "0"                    , wt: WireType.Varint      , read: R.uint64decimal     });
export const uint64hex         = primitive<string>({     name: "uint64hex"         , def: "0"                    , wt: WireType.Varint      , read: R.uint64hex         });

export const maybeBool = maybe(bool);
export const maybeBytes = maybe(bytes);
export const maybeDouble = maybe(double);
export const maybeFloat = maybe(float);
export const maybeInt32 = maybe(int32);
export const maybeInt64decimal = maybe(int64decimal);
export const maybeString = maybe(string);
export const maybeUint32 = maybe(uint32);
export const maybeUint64decimal = maybe(uint64decimal);
export const maybeUint64hex = maybe(uint64hex);

export const optionalBool = optional(bool);
export const optionalBytes = optional(bytes);
export const optionalDouble = optional(double);
export const optionalFloat = optional(float);
export const optionalInt32 = optional(int32);
export const optionalInt64decimal = optional(int64decimal);
export const optionalString = optional(string);
export const optionalUint32 = optional(uint32);
export const optionalUint64decimal = optional(uint64decimal);
export const optionalUint64hex = optional(uint64hex);

export const timestamp = makeTimestamp();
export const duration = makeDuration();

export type ValueMergeReader<TVal, TDef = TVal> = (r: Readable, prev: TVal | TDef) => TVal

function makeMergingSubReader<TVal, TDef = TVal>(valueMergeReader: ValueMergeReader<TVal, TDef>): FieldReader<TVal, TDef> {
    return (readable, wt, number, prev) => {
        if (wt !== WireType.LengthDelim) {
            return new Error(`Invalid wire type for message: ${wt}`);
        }
        const sub = R.sub(readable);
        const pval = prev();
        return valueMergeReader(sub, pval);
    }
}

function readSecondsAndNanos(r: Readable, prev: {seconds?: string, nanos?: number} | undefined): {seconds: string, nanos: number} {
    let seconds = prev?.seconds || "0";
    let nanos = prev?.nanos || 0;
    for (;;) {
        const t = R.tag(r);
        if (t === undefined)
            break;
        const number = R.fieldFromTag(t);
        const wtype = R.wireTypeFromTag(t);
        if (number === 1 && wtype === WireType.Varint) {
            seconds = int64decimal.readValue(r);
        }
        else if (number === 2 && wtype === WireType.Varint) {
            nanos = int32.readValue(r);
        }
        else {
            R.skip(r, wtype);
        }
    }
    return {seconds, nanos}
}

function makeTimestamp(): RepeatableFieldType<Instant, undefined> {
    function readContents(r: Readable, prev: Instant | undefined): Instant {
        const {seconds, nanos} = readSecondsAndNanos(r, prev && {seconds: prev.epochSecond().toString(), nanos: prev.nano()})
        return Instant.ofEpochSecond(parseInt(seconds), nanos);
    }
    return {
        defVal: () => undefined,
        wireType: WireType.LengthDelim,
        readValue: (r) => readContents(r, undefined),
        read: makeMergingSubReader(readContents),
    }
}

function makeDuration(): RepeatableFieldType<Duration, undefined> {
    function readContents(r: Readable, prev: Duration | undefined): Duration {
        const {seconds, nanos} = readSecondsAndNanos(r, {seconds: prev?.seconds().toString(), nanos: prev?.nano()})
        return Duration.ofSeconds(parseInt(seconds), nanos);
    }
    return {
        defVal: () => undefined,
        wireType: WireType.LengthDelim,
        readValue: (r) => readContents(r, undefined),
        read: makeMergingSubReader(readContents),
    }
}

export function repeated<TVal>(item: Deferrable<RepeatableFieldType<TVal, any>>): FieldType<TVal[]> {
    const ft: FieldType<TVal[]> = {
        defVal: () => [],
        read: (r, wt, num, prev) => {
            const {wireType, read, readValue, defVal} = realize(item)
            // packed reading is only allowed for wire types that are not already length-delimited
            if (wireType !== WireType.LengthDelim && wt === WireType.LengthDelim) {
                const array: TVal[] = []
                const sub = R.sub(r);
                while (!sub.isDone()) {
                    const val = readValue(sub);
                    array.push(val);
                }
                return array;
            }
            else {
                const v = read(r, wt, num, defVal);
                const p = prev();
                if (!(v instanceof Error)) {
                    if (p.length > 0)
                        p.push(v);
                    else
                        return [v];
                }
                return p;
            }
        }
    }
    return ft;
}

export type OneOfValue = {
    populated: number,
    value: any,
}

const oneofsDef = () => undefined;
export function oneof<TVal, TDef = TVal>(name: string, fieldType: Deferrable<RepeatableFieldType<TVal, TDef>>): OneofFieldType<TDef> {
    /* The implementation of the oneof is to share a single entry in the vtable among all fields defined with the same oneof name
       and the entry stores the field number of the member that is actually populated, plus the value of that member
       this is mostly handled by the "message" reader maker
    */
    return {
        defVal: oneofsDef,
        oneof: name,
        oneofDefVal: () => realize(fieldType).defVal(),
        read(r, wt, num, prev) {
            const {defVal, read} = realize(fieldType);
            const thisPrev = () => {
                const oprev = prev();
                return (oprev?.populated === num) ? oprev.value : defVal();
            }
            const next = read(r, wt, num, thisPrev);
            return {populated: num, value: next};
        }
    };
}

type ProtoMap<TVal> = {[key: string]: TVal};
const mapsDef = () => ({});
export function map<TVal, TDef>(keyType: FieldType<string> | FieldType<number> | FieldType<boolean>, valueType: Deferrable<RepeatableFieldType<TVal, TDef>>): FieldType<ProtoMap<TVal>> {
    const recordDef = createMessage<{key: string, value: TVal}>([
        [1, "key", keyType],
        [2, "value", valueType],
    ])
    return {
        defVal: mapsDef,
        read(r, wt, num, prev) {
            const record = recordDef.read(r, wt, num, () => undefined);
            if (record instanceof Error)
                return record;
            const pval = prev();
            //pval[record.key] = record.value;
            return ({...pval, [record.key]: record.value});
        }
    }
}

export function makeDecoder<T>(readValue: FieldValueReader<T>): (bytes: Uint8Array) => T {
    return (bytes: Uint8Array) => readValue(fromBytes(bytes))
}
