/*
Wire Types
------------------------
0	Varint	int32, int64, uint32, uint64, sint32, sint64, bool, enum
1	64-bit	fixed64, sfixed64, double
2	Length-delimited	string, bytes, embedded messages, packed repeated fields
3	Start group	groups (deprecated)
4	End group	groups (deprecated)
5	32-bit	fixed32, sfixed32, float
*/

export enum WireType {
    Varint = 0,
    Double = 1,
    LengthDelim = 2,
    StartGroup = 3,
    EndGroup = 4,
    Single = 5,
}

// These are the different wire type length strategies
// Each of these uses a different method for determining length
export const varint: WireType = 0; // length determined by "has more" bit on each byte
export const dword: WireType = 1; // length = 8
export const block: WireType = 2; // length = width of next varint plus value of that varint
export const word: WireType = 5; // length = 4

export type Tag = number & {__type: "Tag"};

export type Blob = ArrayBuffer

export interface Readable {
    isDone(): boolean;
    readByte(): number;
    readBlock(length: number): Uint8Array;
    subreader(length: number): Readable;
}

// This can accept writes, but only contiguous, in order
// this makes it difficult to do things like length-prefix unless you know the length up front
export interface Writable {
    writeByte: (b: number) => void,
    writeBlock: (block: ArrayBuffer) => void,
}

// this adds a begin() and end() which allow automatic length-prefix
export type NestedWritable = Writable & {
    begin: () => void,
    end: () => void,
}

export type NestingTranslator = NestedWritable & Writer;

// this allows dumping to a pre-allocated CodedOutputStream
export interface Writer {
    finish<T>(callback: (length: number, dumpTo: (output: Writable) => void) => T): T,
}

// TODO: do not make field optional, instead use WriteValue, but figure out how to tie field functions to value functions
export type FieldWriter<TVal> = 
    ((w: NestedWritable, value: TVal | undefined, field?: number, force?: boolean) => boolean)

export type FieldReader<TVal, TDef = TVal> =
    ((readable: Readable, wt: WireType, number: number, prev: () => TVal | TDef) => TVal | Error);

export type FieldValueReader<TVal> =
    (readable: Readable) => TVal;

