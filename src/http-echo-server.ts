import * as net from "net"
import TCPConnection from "./base/tcp-connection"
import startTCPServer from "./base/tcp-server"
import { bufferReader, HTTPRequest, HTTPResponse, serveHTTP } from "./base/http"

export default function startEchoServer(options: net.ListenOptions) {
  startTCPServer(options, echo)
}

async function echo(conn: TCPConnection) {
  await serveHTTP(conn, echoRequest)
}

async function echoRequest(req: HTTPRequest): Promise<HTTPResponse> {
  const bodyReader =
    req.uri == "/echo"
      ? req.bodyReader
      : bufferReader(Buffer.from("Hello, World!"))

  return HTTPResponse.ok(req.version, [], bodyReader)
}
