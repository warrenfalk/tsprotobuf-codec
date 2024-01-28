import { Reducer } from './reducers';

export type GrpcService = {
    readonly name: string;
};

export type GrpcServiceMethod<TRequest, TResponse, TResult> =
    | GrpcUnaryMethod<TRequest, TResponse>
    | GrpcClientStreamingMethod<TRequest, TResponse>
    | GrpcServerStreamingMethod<TRequest, TResponse, TResult>
    | GrpcBidirectionalMethod<TRequest, TResponse, TResult>;

type GrpcMethodBase<TRequest, TResponse> = {
    readonly service: GrpcService,
    readonly name: string,
    readonly encode: (v: TRequest) => Uint8Array,
    readonly decode: (v: Uint8Array) => TResponse,
}

export type GrpcUnaryMethod<TRequest, TResponse> = GrpcMethodBase<TRequest, TResponse> & {
    readonly reducer: undefined,
    readonly clientStreaming: false,
}

export type GrpcServerStreamingMethod<TRequest, TResponse, TResult> = GrpcMethodBase<TRequest, TResponse> & {
    readonly reducer: () => Reducer<TResult, TResponse>,
    readonly clientStreaming: false,
}

export type GrpcClientStreamingMethod<TRequest, TResponse> = GrpcMethodBase<TRequest, TResponse> & {
    readonly reducer: undefined,
    readonly clientStreaming: true,
}

export type GrpcBidirectionalMethod<TRequest, TResponse, TResult> = GrpcMethodBase<TRequest, TResponse> & {
    readonly reducer: () => Reducer<TResult, TResponse>,
    readonly clientStreaming: true,
}

export function unary<TRequest, TResponse>(
    service: GrpcService,
    name: string,
    encode: (v: TRequest) => Uint8Array,
    decode: (v: Uint8Array) => TResponse,
    ): GrpcUnaryMethod<TRequest, TResponse> {
    return { service, name, encode, decode, reducer: undefined, clientStreaming: false};
}

export function serverStreaming<TRequest, TResponse, TResult>(
    service: GrpcService,
    name: string,
    encode: (v: TRequest) => Uint8Array,
    decode: (v: Uint8Array) => TResponse,
    reducer: () => Reducer<TResult, TResponse>,
    ): GrpcServerStreamingMethod<TRequest, TResponse, TResult> {
    return { service, name, encode, decode, reducer, clientStreaming: false };
}

export function clientStreaming<TRequest, TResponse>(
    service: GrpcService,
    name: string,
    encode: (v: TRequest) => Uint8Array,
    decode: (v: Uint8Array) => TResponse,
    ): GrpcClientStreamingMethod<TRequest, TResponse> {
    return { service, name, encode, decode, reducer: undefined, clientStreaming: true};
}

export function bidiStreaming<TRequest, TResponse, TResult>(
    service: GrpcService,
    name: string,
    encode: (v: TRequest) => Uint8Array,
    decode: (v: Uint8Array) => TResponse,
    reducer: () => Reducer<TResult, TResponse>,
    ): GrpcBidirectionalMethod<TRequest, TResponse, TResult> {
    return { service, name, encode, decode, reducer, clientStreaming: true };
}

