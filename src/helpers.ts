import { NestedWritable, WireType, FieldWriter, FieldValueReader } from "./types";
import { tag } from "./write-field";
import { useSharedWriter } from "./writer";
import { Reader } from './protobuf-codec-ts';


export function once<T>(fn: () => T): () => T {
    let get = () => {
        const value = fn();
        get = () => value;
        return value;
    }
    return () => get();
}

const zeroBytes = new Uint8Array(0);
export const empty = () => Reader.fromBytes(zeroBytes);

export const noconstructor: new () => any = class { constructor() { throw new Error("Attempt to use 'noconstructor'"); }};