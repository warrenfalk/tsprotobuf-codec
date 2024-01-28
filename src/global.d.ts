// This library assumes that TextEncoder is available
// If it is not available in some context, then it will have to be polyfilled elsewhere before this library is loaded


interface TextEncodeOptions {
    stream?: boolean;
}

interface TextEncoder {
    readonly encoding: string;
    encode(input?: string, options?: TextEncodeOptions): Uint8Array;
}

interface TextDecoderOptions {
    stream?: boolean;
}

declare var TextEncoder: {
    prototype: TextEncoder;
    new(): TextEncoder;
};

interface TextDecoder {
    readonly encoding: string;
    decode(input?: Uint8Array, options?: TextDecoderOptions): string;
}

declare var TextDecoder: {
    (label?: string, options?: TextDecoderOptions): TextDecoder;
    new (label?: string, options?: TextDecoderOptions): TextDecoder;
    encoding: string;
};
