import { RepeatableFieldType } from './field-types';
import { FieldWriter, FieldReader, WireType, FieldValueReader } from './types';
import * as W from "./write-field";
import * as R from "./read-value";
import { int32 } from "./field-types";
import { once } from "./helpers";

type EnumDefMap = {[name: string]: number};

export type EnumDef<ProtoName extends string, TMap extends EnumDefMap> = {
    from: EnumConstructor<ProtoName, TMap>,
    toString: (v: Literal<TMap> | EnumValue<ProtoName, Literal<TMap>> | undefined) => string | undefined,
    toNumber: EnumToNumber<Literal<TMap>, ProtoName>,
    write: FieldWriter<Literal<TMap> | EnumValue<ProtoName, Literal<TMap>>>,
    defVal: () => 0,
    read: FieldReader<EnumValue<ProtoName>, 0>,
    wireType: WireType.Varint,
    readValue: FieldValueReader<EnumValue<ProtoName>>,
} & {
    [name in keyof TMap]: EnumValue<ProtoName, Extract<name, string> | Extract<TMap[name], number>>
}

export function enumValue<ProtoName, TMap extends EnumDefMap>(n: TMap[keyof TMap], s: Extract<keyof TMap, string>): EnumValue<ProtoName, Literal<TMap>> {
    return {
        toString: () => s,
        toJSON: () => s,
        toNumber: () => n,
    } as any as EnumValue<ProtoName, Literal<TMap>>
}

export function define<ProtoName extends string, TMap extends EnumDefMap>(placeholder: EnumDef<ProtoName, TMap>, enumDef: TMap): void {
    const v: {[name: string]: EnumValue<ProtoName>} = {};
    const map = new Map<string|number, EnumValue<ProtoName, Literal<TMap>>>();
    for (const s in enumDef) {
        const n = enumDef[s];
        const val = enumValue<ProtoName, TMap>(n, s);
        v[s] = val
        map.set(s.toLowerCase(), val);
        map.set(n, val);
    }
    const from = makeEnumConstructor<ProtoName, TMap>(map);
    const toNumber = makeToNumber(from);
    const toString = makeToString(from);
    const write = makeEnumWriter(toNumber);
    const e = enumeration(() => ({from}));
    Object.assign(placeholder, {...v, from, toNumber, toString, write, ...e});
}

export function makeEnumConstructor<ProtoName extends string, TMap extends EnumDefMap>(
    map: Map<string|number, EnumValue<ProtoName, Literal<TMap>>>
    ): EnumConstructor<ProtoName, TMap>
    {
    return (v: EnumValue<ProtoName, Literal<TMap>> | Literal<TMap>) => {
        const e: EnumValue<ProtoName, Literal<TMap>> | undefined =
            (typeof v === "number") ? map.get(v) :
            (typeof v === "string") ? map.get(v.toLowerCase()) :
            v;
        if (e === undefined)
            throw new Error(`Invalid EnumType ${v}`)
        return e;
    }
}

export type Literal<TMap extends EnumDefMap> = Extract<keyof TMap, string> | TMap[keyof TMap];

export type Value<ProtoName, TMap extends EnumDefMap, ValName extends string> =  EnumValue<ProtoName, ValName | TMap[ValName]> | ValName | TMap[ValName]

export type EnumConstructor<ProtoName, TMap extends EnumDefMap> = (v: EnumValue<ProtoName, Literal<TMap>> | Literal<TMap>) => EnumValue<ProtoName, Literal<TMap>>;

export function makeToNumber<ProtoName, TMap extends EnumDefMap>(construct: EnumConstructor<ProtoName, TMap>): EnumToNumber<Literal<TMap>, ProtoName> {
    return ((v: EnumValue<ProtoName, Literal<TMap>> | Literal<TMap> | undefined) =>
        (v === undefined) ? undefined : construct(v).toNumber()) as EnumToNumber<Literal<TMap>, ProtoName>;
}

export function makeToString<ProtoName, TMap extends EnumDefMap>(construct: EnumConstructor<ProtoName, TMap>) {
    return (v: EnumValue<ProtoName, Literal<TMap>> | Literal<TMap> | undefined) =>
        (v === undefined) ? undefined : construct(v).toString();
}

interface Enum {
    toString(): string,
    toJSON(): string,
    toNumber(): number,
}
export type EnumValue<ProtoName, Literal extends string | number = string | number> = Enum & {__enum: ProtoName, __literal: Literal}

export function makeEnumWriter<ProtoName, TLiteral>(toNumber: EnumToNumber<TLiteral, ProtoName>): FieldWriter<EnumValue<ProtoName> | TLiteral> {
    return (w, value, field, force) => W.int32(w, toNumber(value), field, force);
}

export interface EnumToNumber<TLiteral, ProtoName> {
    (v: TLiteral | EnumValue<ProtoName>): number
    (v: undefined): undefined
    (v: TLiteral | EnumValue<ProtoName> | undefined): number | undefined
}

export function enumeration<ProtoName, TMap extends EnumDefMap>(getEnumDef: () => {from: EnumConstructor<ProtoName, TMap>}): RepeatableFieldType<EnumValue<ProtoName>> {
    type TLiteral = Literal<TMap>
    type TEnum = EnumValue<ProtoName>
    getEnumDef = once(getEnumDef);
    const defVal = once(() => getEnumDef().from(0 as TMap[keyof TMap]));
    const readValue: FieldValueReader<TEnum> = (r) => {
        const v = int32.readValue(r);
        return getEnumDef().from(v as TLiteral);
    }
    const read: FieldReader<TEnum> = (r, wt, number, prev) => {
        if (wt != WireType.Varint) {
            R.skip(r, wt);
            return new Error(`Invalid wire type for enumeration: ${wt}`);
        }
        return readValue(r);
    }
    return {
        defVal,
        wireType: WireType.Varint,
        readValue,
        read, 
    };
}

