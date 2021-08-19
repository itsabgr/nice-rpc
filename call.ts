import Ctx from './ctx';
import * as grpc from '@grpc/grpc-js';
import Exception from './ex';

export enum Type {
  Unary = 'unary',
  ClientStream = 'clientStream',
  ServerStream = 'serverStream',
  Bidi = 'bidi'
}

export function Typeof(call: untyped<any, any>, cb?: grpc.sendUnaryData<any>): Type {
  if (cb) {
    if ('request' in call) {
      return Type.Unary
    }
    return Type.ClientStream
  }
  if ('request' in call) {
    return Type.ServerStream
  }
  return Type.Bidi
}

export type untyped<Req, Res> = grpc.ServerUnaryCall<Req, Res> |
  grpc.ServerReadableStream<Req, Res> |
  grpc.ServerWritableStream<Req, Res> |
  grpc.ServerDuplexStream<Req, Res>

export abstract class Call<CallType extends untyped<Req, Res>,
  Req = CallType extends untyped<infer Req, object> ? Req : object,
  Res = CallType extends untyped<object, infer Res> ? Res : object> extends Ctx {
  // static from<I, O>(call: grpc.ServerUnaryCall<I, O>, cb: grpc.sendUnaryData<O>): Call<grpc.ServerUnaryCall<I, O>>
  // static from<I, O>(call: grpc.ServerWritableStream<I, O>): Call<grpc.ServerWritableStream<I, O>>
  // static from<I, O>(call: grpc.ServerDuplexStream<I, O>): Call<grpc.ServerDuplexStream<I, O>>
  // static from<I, O>(call: grpc.ServerReadableStream<I, O>, cb: grpc.sendUnaryData<O>): Call<grpc.ServerReadableStream<I, O>>
  // static from<I, O>(call: untyped<I, O>, cb?: grpc.sendUnaryData<O>): Call<untyped<I, O>>
  static from<I, O>(call: untyped<I, O>, cb?: grpc.sendUnaryData<O>): Call<untyped<I, O>> {
    switch (Typeof(call, cb)) {
      case Type.Bidi:
        return Call.fromBidiStream<I, O>(call as grpc.ServerDuplexStream<I, O>) as Call<untyped<I, O>>
      case Type.ServerStream:
        return Call.fromServerStream<I, O>(call as grpc.ServerWritableStream<I, O>) as Call<untyped<I, O>>
      case Type.ClientStream:
        return Call.fromClientStream<I, O>(call as grpc.ServerReadableStream<I, O>, cb as grpc.sendUnaryData<O>) as Call<untyped<I, O>>
      case Type.Unary:
        return Call.fromUnary<I, O>(call as grpc.ServerUnaryCall<I, O>, cb as grpc.sendUnaryData<O>) as Call<untyped<I, O>>
    }
    throw Exception('unknown call type', {call, callback: cb})
  }

  static fromUnary<I, O>(call: grpc.ServerUnaryCall<I, O>, cb: grpc.sendUnaryData<O>) {
    return new unary(call, cb)
  }

  static fromServerStream<I, O>(call: grpc.ServerWritableStream<I, O>) {
    return new serverStream(call)
  }

  static fromClientStream<I, O>(call: grpc.ServerReadableStream<I, O>, cb: grpc.sendUnaryData<O>) {
    return new clientStream(call, cb)
  }

  static fromBidiStream<I, O>(call: grpc.ServerDuplexStream<I, O>) {
    return new bidi(call)
  }
  protected constructor(
    _call: grpc.ServerDuplexStream<Req, Res>,
  )
  protected constructor(
    _call: grpc.ServerWritableStream<Req, Res>,
  )
  protected constructor(
    _call: grpc.ServerUnaryCall<Req, Res>,
    _cb?: grpc.sendUnaryData<Res>,
  )
  protected constructor(
    _call: grpc.ServerReadableStream<Req, Res>,
    _cb?: grpc.sendUnaryData<Res>,
  )
  protected constructor(
    protected readonly _call: CallType,
    protected readonly _cb?: grpc.sendUnaryData<Res>,
  ) {
    super((error?: Error) => {
      if (!this._call.cancelled) {
        if (error) {
          if (this._cb) {
            this._cb(error)
          }
        } else if ('end' in this._call) {
          (this._call as grpc.ServerWritableStream<Req, Res>).end()
        }
      }
      if (!this._call.cancelled && !error && 'end' in this._call) {
        (this._call as grpc.ServerWritableStream<Req, Res>).end()
      }
    })
    this._call.once('error', (error) => {
      this.close(error)
    })
    this._call.once('end', () => {
      this.close()
    })
  }

  get meta() {
    return this._call.metadata
  }

  get peer() {
    return this._call.getPeer()
  }

  get deadline() {
    return this._call.getDeadline()
  }

  sendMeta(meta: grpc.Metadata) {
    return this._call.sendMetadata(meta)
  }

  send(data: Res, trailer?: grpc.Metadata) {
    return new Promise<void>((resolve, reject) => {
      if (this._cb) {
        this._cb(null, data, trailer)
        resolve()
        return
      }
      (this._call as grpc.ServerWritableStream<Req, Res>).write(data, (err?: Error) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  get type() {
    return Typeof(this._call, this._cb)
  }

  abstract [Symbol.asyncIterator](): AsyncIterable<Req>
}

export class unary<Req, Res> extends Call<grpc.ServerUnaryCall<Req, Res>,Req,Res> {
  constructor(call: grpc.ServerUnaryCall<Req, Res>, cb: grpc.sendUnaryData<Res>) {
    super(call, cb)
  }

  async* [Symbol.asyncIterator]() {
    return this._call.request
  }

}

export class clientStream<Req, Res> extends Call<grpc.ServerReadableStream<Req, Res>> {
  constructor(call: grpc.ServerReadableStream<Req, Res>, cb: grpc.sendUnaryData<Res>) {
    super(call, cb)
  }

  async* [Symbol.asyncIterator]() {
    for await (const req of this._call) {
      yield req
    }
  }

}

export class serverStream<Req, Res> extends Call<grpc.ServerWritableStream<Req, Res>> {
  constructor(call: grpc.ServerWritableStream<Req, Res>) {
    super(call)
  }

  async* [Symbol.asyncIterator]() {
    return this._call.request
  }

}

export class bidi<Req, Res> extends Call<grpc.ServerDuplexStream<Req, Res>> implements Call<grpc.ServerDuplexStream<Req, Res>> {
  constructor(call: grpc.ServerDuplexStream<Req, Res>) {
    super(call)
  }

  async* [Symbol.asyncIterator]() {
    for await (const req of this._call) {
      yield req
    }
  }

}



