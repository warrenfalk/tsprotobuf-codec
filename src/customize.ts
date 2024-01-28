import { RepeatableFieldType, FieldType, makeDecoder } from './field-types';
import { Readable, NestedWritable, FieldWriter, WireType } from './types';
import { MessageFieldType, extendBasicCodec, TypeCodecBasic, TypeCodec, MessageDef } from './messages';
import { makeEncoder } from './write-field';

type SurrogateDef<TSurrogate, TDefault, TStrict, TValue> = {
    defVal: () => TDefault,
    isDef: (v: TSurrogate | TDefault) => v is TDefault,
    fromSurrogate: (surrogate: TSurrogate) => TValue,
    toSurrogate: (raw: TStrict) => TSurrogate,
};

type Customizable<TStrict, TValue> = {
    usingSurrogate<TSurrogate, TDefault>(surrogateDef: SurrogateDef<TSurrogate, TDefault, TStrict, TValue>): TypeCodec<TSurrogate, TSurrogate, TDefault>
}

// This should ultimately replace MessageFieldType
type MessageType<TStrict, TLoose> = MessageFieldType<TStrict> & RepeatableType<TStrict, undefined> & {
    create(v: TLoose): TStrict,
    writeValue(w: NestedWritable, value: TStrict | TLoose): void,
    write(w: NestedWritable, value: TStrict | TLoose | undefined, field?: number | undefined, force?: boolean | undefined): boolean,
}

// This should ultimately replace RepeatableFieldTYpe
type RepeatableType<TVal, TDef = TVal> = RepeatableFieldType<TVal, TDef> & ProtoType<TVal, TDef> & {
    writeValue(w: NestedWritable, value: TVal): void,
}

type ProtoType<TVal, TDef> = FieldType<TVal, TDef> & {
    write: FieldWriter<TVal | TDef>,
}

function createConverter<TStrict extends TValue, TValue>(rawType: TypeCodecBasic<TStrict, TValue, undefined>) {
    return <TSurrogate, TDefault>(surrogateDef: SurrogateDef<TSurrogate, TDefault, TStrict, TValue>): TypeCodec<TSurrogate, TSurrogate, TDefault> => {
        const {defVal, isDef, toSurrogate, fromSurrogate} = surrogateDef;
        const rawMsg = extendBasicCodec(rawType);
        const writeContents = (w: NestedWritable, value: TSurrogate) => rawType.writeContents(w, fromSurrogate(value));
        const writeValue = (w: NestedWritable, value: TSurrogate) => rawMsg.writeValue(w, fromSurrogate(value));
        const readValue = (r: Readable) => toSurrogate(rawMsg.readValue(r));
        const surrogate: TypeCodec<TSurrogate, TSurrogate, TDefault> = {
            defVal,
            isDef,
            readValue,
            read: (r, wt, number, prev) => {
                const raw = rawMsg.read(r, wt, number, () => undefined);
                return raw instanceof Error ? raw : toSurrogate(raw);
            },
             // TODO: the "prev" argument in the following is basically just not really supported, but probably could be if there were a use case
            readMessageValue: (r, prev) => toSurrogate(rawType.readMessageValue(r, undefined)) as any,
            writeContents,
            writeValue,
            write(w, value, field) {
                if (isDef(value))
                    return false;
                const rawValue = fromSurrogate(value);
                return rawMsg.write(w, rawValue, field);
            },
            encode: makeEncoder(writeContents),
            decode: makeDecoder(readValue),
            create: (value: TSurrogate, merge?: TSurrogate) => toSurrogate(rawType.create(fromSurrogate(value), merge !== undefined ? fromSurrogate(merge) : undefined)),
        };
        return surrogate;
    }
}

// This crazy generic code below allows us to get the Strict and Loose variations given only the message namespace
export function message<TStrict extends TValue, TValue>(rawType: MessageDef<TStrict, TValue>): Customizable<TStrict, TValue> {
    return {
        usingSurrogate: createConverter<TStrict, TValue>(rawType)
    }
}
