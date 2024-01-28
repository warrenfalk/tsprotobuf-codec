import {FieldWriter, Writable, WireType, NestedWritable} from "./types"
import * as val from "./write-value";
import Long from "long"
import { useSharedWriter } from "./writer";
import { Instant, Duration } from "@js-joda/core";
import { isUndefined } from './isundefined'


export type ValueWriter<T> = (w: NestedWritable, value: T) => void;
export type WriteField<TVal, TDef> = (w: NestedWritable, value: TVal | TDef, field?: number) => boolean

export function makeDelimitedWriter<T>(writeContents: ValueWriter<T>): ValueWriter<T> {
    return (w: NestedWritable, value: T) => {
        w.begin();
        writeContents(w, value);
        w.end();
    }
}

export function makeFieldWriter<TVal, TDef>(writeValue: ValueWriter<TVal>, isDef: (v: TVal | TDef) => v is TDef): WriteField<TVal, TDef> {
    return (w: NestedWritable, value: TVal | TDef, field?: number) => {
        if (isDef(value)) {
            return false;
        }
        if (field !== undefined)
            tag(w, field, WireType.LengthDelim);
        writeValue(w, value);
        return true;
    }
}

export function makeEncoder<T>(writeValue: ValueWriter<T>): (v: T) => Uint8Array {
    return (value: T) => {
        return useSharedWriter(w => {
            writeValue(w, value);
        })
    }
}

export namespace FieldEnc {
    export const double = WireType.Double;
    export const float = WireType.Single;
    export const int64 = WireType.Varint;
    export const uint64 = WireType.Varint;
    export const int32 = WireType.Varint;
    export const fixed64 = WireType.Double;
    export const fixed32 = WireType.Single;
    export const boolean = WireType.Varint;
    export const string = WireType.LengthDelim;
    export const bytes = WireType.LengthDelim;
    export const uint32 = WireType.Varint;
    export const enumeration = WireType.Varint;
    export const sfixed32 = WireType.Single;
    export const sfixed64 = WireType.Double;
    export const sint32 = WireType.Varint;
    export const sint64 = WireType.Varint;
}

function lengthOf(buffer: Uint8Array | ArrayBuffer | number[]) {
    if (Array.isArray(buffer))
        return buffer.length;
    return buffer.byteLength;
}

export const tag: (writable: Writable, field: number, wire: WireType) => void
= (w, field, wire) => val.int32(w, (field << 3) | wire)

export function packed<T>(w: NestedWritable, writeOne: FieldWriter<T>, repeated: Iterable<T> | undefined, field: number): void {
    if (repeated) {
        const iterator = repeated[Symbol.iterator]();
        const first = iterator.next();
        if (!first.done) {
            tag(w, field, WireType.LengthDelim);
            w.begin();
            writeOne(w, first.value, undefined, true);
            for (let current = iterator.next(); !current.done; current = iterator.next()) {
                writeOne(w, current.value, undefined, true);
            }
            w.end();
        }
    }
}

export const repeated: <T>(writable: NestedWritable, writer: FieldWriter<T>, value: Iterable<T> | undefined, field: number) => void
= (w, writeOne, repeated, field) => {
    if (repeated) {
        for (const record of repeated) {
            writeOne(w, record, field, true);
        }
    }
}

function writeMapEntry<K, V>(w: NestedWritable, field: number, writeKey: FieldWriter<K>, writeValue: FieldWriter<V>, key: K, value: V) {
    tag(w, field, WireType.LengthDelim);
    w.begin();
    writeKey(w, key, 1, false);
    writeValue(w, value, 2, false);
    w.end();
}

export const map: <K, V>(writable: NestedWritable, keyWriter: FieldWriter<K>, keyFromString: (v: string) => K, valueWriter: FieldWriter<V>, records: Map<K, V> | {[name: string]: V | undefined} | undefined, field: number) => void
= (w, writeKey, keyFromString, writeValue, records, field) => {
    if (records === undefined)
        return;
    if (records instanceof Map) {
        for (const [key, value] of records) {
            writeMapEntry(w, field, writeKey, writeValue, key, value);
        }
    }
    else {
        for (const stringKey in records) {
            const value = records[stringKey];
            if (value === undefined) {
                continue;
            }
            const key = keyFromString(stringKey);
            writeMapEntry(w, field, writeKey, writeValue, key, value);
        }
    }
}

/// ----------------------------------------------------------------------------

type WriteValue<TVal> = (w: Writable, value: TVal) => void;

// This makes a writer for a field when the protobuf type of the field is representable by a single javascript data type
function makeWriter<TVal>({ wireType, writeValue, isDefault }: { wireType: WireType; writeValue: WriteValue<TVal>; isDefault: (v: TVal) => boolean; }) {
    return (writable: Writable, value: TVal | undefined, field: number | undefined, force: boolean = false) => {
        if (value === undefined || (isDefault(value) && !force))
            return false;
        if (field !== undefined)
            tag(writable, field, wireType);
        writeValue(writable, value);
        return true;
    }
}

// This makes a writer for a field when the protobuf type of the field cannot be fully represented by a single javascript data type
// so we use some kind of surrogate type
function makeLongWriter<TSurrogate>(
{ wireType, writeNumber, writeLong, toLong, isNil = () => false }: { wireType: WireType; writeNumber: FieldWriter<number>; writeLong: WriteValue<Long>; toLong: (v: TSurrogate) => Long; isNil?: (v: TSurrogate) => boolean; }) {
    return (writable: NestedWritable, value: TSurrogate | number | undefined, field: number | undefined, force: boolean = false) => {
        if (typeof value === "number")
            return writeNumber(writable, value, field, force)
        if (value === undefined || isNil(value))
            return false;
        const long = toLong(value);
        if (!force && long.isZero())
            return false;
        if (field !== undefined)
            tag(writable, field, wireType);
        writeLong(writable, long);
        return true;
    }
}

const longFromString: (signed: boolean, base: number) => (v: string) => Long = (signed, base) => (v) => Long.fromString(v, !signed, base);

export const int32: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.int32,
    writeValue: val.int32,
    isDefault: value => value === 0,
});

export const int64: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.int64,
    writeValue: val.int64,
    isDefault: value => value === 0,
});

export const int64long: FieldWriter<Long | number> = makeLongWriter({
    wireType: FieldEnc.int64,
    writeNumber: int64,
    writeLong: val.int64long,
    toLong: v => v,
});

function numberStringIsNil(v: string) {
    return v === "";
}

export const int64decimal: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.int64,
    writeNumber: int64,
    writeLong: val.int64long,
    toLong: longFromString(true, 10),
    isNil: numberStringIsNil,
});

export const int64decimalpad = int64decimal; // these should be the same because the latter should handle zero padding already

export const int64hex: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.int64,
    writeNumber: int64,
    writeLong: val.int64long,
    toLong: longFromString(true, 16),
    isNil: numberStringIsNil,
})

export const int64hexpad = int64hex; // these should be the same because the latter should handle zero padding already

export const bool: FieldWriter<boolean> = makeWriter({
    wireType: FieldEnc.boolean,
    writeValue: val.bool,
    isDefault: value => value === false,
});

export const double: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.double,
    writeValue: val.double,
    isDefault: value => value === 0 && !Object.is(value, -0),
});

export const fixed32: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.fixed32,
    writeValue: val.fixed32,
    isDefault: value => value === 0,
});

export const fixed64: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.fixed64,
    writeValue: val.fixed64,
    isDefault: value => value === 0,
});

export const fixed64long: FieldWriter<Long | number> = makeLongWriter({
    wireType: FieldEnc.fixed64,
    writeNumber: fixed64,
    writeLong: val.fixed64long,
    toLong: v => v,
});

export const fixed64decimal: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.fixed64,
    writeNumber: fixed64,
    writeLong: val.fixed64long,
    toLong: longFromString(false, 10),
    isNil: numberStringIsNil,
});

export const fixed64decimalpad = fixed64decimal; // these should be the same because the latter should handle zero padding already

export const fixed64hex: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.fixed64,
    writeNumber: fixed64,
    writeLong: val.fixed64long,
    toLong: longFromString(false, 16),
    isNil: numberStringIsNil,
})

export const fixed64hexpad = fixed64hex; // these should be the same because the latter should handle zero padding already

export const float: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.float,
    writeValue: val.float,
    isDefault: value => value === 0 && !Object.is(value, -0),
});

export const sfixed32: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.sfixed32,
    writeValue: val.sfixed32,
    isDefault: value => value === 0,
});

export const sfixed64: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.sfixed64,
    writeValue: val.sfixed64,
    isDefault: value => value === 0,
});

export const sfixed64decimal: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.sfixed64,
    writeNumber: sfixed64,
    writeLong: val.sfixed64long,
    toLong: longFromString(false, 10),
    isNil: numberStringIsNil,
});

export const sfixed64decimalpad = sfixed64decimal; // these should be the same because the latter should handle zero padding already

export const sfixed64hex: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.sfixed64,
    writeNumber: sfixed64,
    writeLong: val.sfixed64long,
    toLong: longFromString(false, 16),
    isNil: numberStringIsNil,
})

export const sfixed64hexpad = sfixed64hex; // these should be the same because the latter should handle zero padding already

export const sfixed64long: FieldWriter<Long | number> = makeLongWriter({
    wireType: FieldEnc.sfixed64,
    writeNumber: sfixed64,
    writeLong: val.sfixed64long,
    toLong: v => v,
});

export const sint32: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.sint32,
    writeValue: val.sint32,
    isDefault: value => value === 0,
});

export const sint64: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.sint64,
    writeValue: val.sint64,
    isDefault: value => value === 0,
});

export const sint64decimal: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.sint64,
    writeNumber: sint64,
    writeLong: val.sint64long,
    toLong: longFromString(true, 10),
    isNil: numberStringIsNil,
});

export const sint64decimalpad = sint64decimal; // these should be the same because the latter should handle zero padding already

export const sint64hex: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.sint64,
    writeNumber: sint64,
    writeLong: val.sint64long,
    toLong: longFromString(true, 16),
    isNil: numberStringIsNil,
})

export const sint64hexpad = sint64hex; // these should be the same because the latter should handle zero padding already

export const sint64long: FieldWriter<Long | number> = makeLongWriter({
    wireType: FieldEnc.sint64,
    writeNumber: sint64,
    writeLong: val.sint64long,
    toLong: v => v,
});

export const string: FieldWriter<string> = makeWriter({
    wireType: FieldEnc.string,
    writeValue: val.string,
    isDefault: value => value === "",
});

export const bytes: FieldWriter<ArrayBuffer | number[]> = makeWriter({
    wireType: FieldEnc.bytes,
    writeValue: val.bytes,
    isDefault: value => lengthOf(value) === 0,
});

export const uint32: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.uint32,
    writeValue: val.uint32,
    isDefault: value => value === 0,
});

export const uint64: FieldWriter<number> = makeWriter({
    wireType: FieldEnc.uint64,
    writeValue: val.uint64,
    isDefault: value => value === 0,
});

export const uint64long: FieldWriter<Long | number> = makeLongWriter({
    wireType: FieldEnc.uint64,
    writeNumber: uint64,
    writeLong: val.uint64long,
    toLong: v => v,
});

export const uint64decimal: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.uint64,
    writeNumber: uint64,
    writeLong: val.uint64long,
    toLong: longFromString(false, 10),
    isNil: numberStringIsNil,
});

export const uint64decimalpad = uint64decimal; // these should be the same because the latter should handle zero padding already

export const uint64hex: FieldWriter<string | number> = makeLongWriter<string>({
    wireType: FieldEnc.uint64,
    writeNumber: uint64,
    writeLong: val.uint64long,
    toLong: longFromString(false, 16),
    isNil: numberStringIsNil,
})

export const uint64hexpad = uint64hex; // these should be the same because the latter should handle zero padding already

function optional<T>(baseWrite: FieldWriter<T>): FieldWriter<T> {
    return (w, value, field, force) => {
        return baseWrite(w, value, field, true);
    }
}

function maybe<T>(baseWrite: FieldWriter<T>): FieldWriter<T> {
    const contentWriter: ValueWriter<T> = (w, v) => {
        baseWrite(w, v, 1);
    }
    const writeValue = makeDelimitedWriter(contentWriter);
    const write = makeFieldWriter(writeValue, isUndefined);
    return (w, value, field, force) => {
        if (value === undefined && !force)
            return false;
        return write(w, value, field);
    }
}

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

function writeTimestampContents(writable: NestedWritable, value: Instant) {
    const seconds = value.epochSecond();
    const nanos = value.nano();
    int64(writable, seconds, 1, false);
    int32(writable, nanos, 2, false);
}
const writeTimestampValue = makeDelimitedWriter(writeTimestampContents);
export const timestamp = makeFieldWriter(writeTimestampValue, isUndefined);

function writeDurationContents(writable: NestedWritable, value: Duration) {
    const seconds = value.seconds();
    const nanos = value.nano();
    int64(writable, seconds, 1, false);
    int32(writable, nanos, 2, false);
}
const writeDurationValue = makeDelimitedWriter(writeDurationContents);
export const duration = makeFieldWriter(writeDurationValue, isUndefined);
