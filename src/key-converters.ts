type KeyConverter<K> = (key: string) => K;

const identity = (x: string) => x;
const toInteger = (x: string) => parseInt(x, 10);
const toBoolean = (s: string) => s === "true"

export const int32: KeyConverter<number> = toInteger;
export const int64: KeyConverter<number> = toInteger;
export const int64decimal: KeyConverter<string> = identity;
export const bool: KeyConverter<boolean> = toBoolean;
export const fixed32: KeyConverter<number> = toInteger;
export const fixed64: KeyConverter<number> = toInteger;
export const fixed64decimal: KeyConverter<string> = identity;
export const sfixed32: KeyConverter<number> = toInteger;
export const sfixed64: KeyConverter<number> = toInteger;
export const sfixed64decimal: KeyConverter<string> = identity;
export const sint32: KeyConverter<number> = toInteger;
export const sint64: KeyConverter<number> = toInteger;
export const sint64decimal: KeyConverter<string> = identity;
export const string: KeyConverter<string> = identity;
export const uint32: KeyConverter<number> = toInteger;
export const uint64: KeyConverter<number> = toInteger;
export const uint64decimal: KeyConverter<string> = identity;
