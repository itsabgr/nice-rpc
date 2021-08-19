import * as proto3 from '@grpc/proto-loader'
import * as grpc from '@grpc/grpc-js'
import * as call from './call';
import Exception from './ex';
export class Server{
  #server:grpc.Server
  constructor(
    readonly _proto:proto3.PackageDefinition,
    opt?:grpc.ChannelOptions
  ) {
    this.#server = new grpc.Server(opt)
  }

  handle<Request extends object,Response extends object>(serviceName:string,methodName:string,...handlers:handler<Request, Response>[]){
    if(!(handlers.length > 0)){
      throw Exception('Invalid handlers', {handlers})
    }
    const serviceDef = this._proto[serviceName] as proto3.ServiceDefinition
    if (!serviceDef){
      throw new Error(`Service "${serviceName}" is not exist in proto.`)
    }
    const methodDef = serviceDef[methodName]
    if (!methodDef){
      throw new Error(`Method "${methodName}" is not exist in service "${serviceName}".`)
    }
    let methodType:call.Type
    if (methodDef.requestStream) {
      if (methodDef.responseStream) {
        methodType = call.Type.Bidi;
      } else {
        methodType = call.Type.ClientStream;
      }
    } else {
      if (methodDef.responseStream) {
        methodType = call.Type.ServerStream;
      } else {
        methodType = call.Type.Unary;
      }
    }
    const handler = async (anyCall:call.untyped<Request, Response>,cb?:grpc.sendUnaryData<Response>)=>{
      let normalizedCall = call.Call.from(anyCall,cb)
      if (call.Typeof(anyCall,cb) !== methodType){
          normalizedCall.close(new Error('MISMATCH_CALL_TYPE'))
      }
      try{
        for (const handler of handlers){
          await handler(normalizedCall)
        }
        normalizedCall.close()
      }catch (error){
        try {
          normalizedCall.close(error)
        }catch (_){}
        throw error
      }
    }


    const success = this.#server.register(
      methodDef.path,
      handler,
      methodDef.responseSerialize,
      //@ts-ignore
      methodDef.requestDeserialize,
      methodType
    );

    if (success === false) {
      throw new Error(`Method handler for ${methodDef.path} already provided.`);
    }
  }
  listen(addr:string,cred?:grpc.ServerCredentials){
    return new Promise<void>((resolve, reject) => {
      if (!cred){
        cred = grpc.ServerCredentials.createInsecure()
      }
      this.#server.bindAsync(addr,cred,(err)=>{
        if (err){
          reject(err)
          return
        }
        resolve()
      })
    })

  }
}

export type handler<I,O> = (call:call.Call<call.untyped<I, O>>)=>Promise<void>