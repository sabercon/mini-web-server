import * as net from "net"
import TCPConnection from "./base/tcp-connection"
import startTCPServer from "./base/tcp-server"
import {
  BodyReader,
  BufferGenerator,
  HTTPRequest,
  HTTPResponse,
  serveHTTP,
} from "./base/http"

export default function startHTTPServer(options: net.ListenOptions) {
  startTCPServer(options, handleHTTPConnection)
}

async function handleHTTPConnection(conn: TCPConnection) {
  await serveHTTP(conn, handleHTTPRequest)
}

async function handleHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  let reader: BodyReader | Buffer | BufferGenerator
  switch (req.uri) {
    case "/echo":
      reader = req.bodyReader
      break
    case "/sheep":
      reader = sheepCounter()
      break
    default:
      reader = Buffer.from("Hello World!")
  }

  return Promise.resolve(HTTPResponse.ok(req.version, [], reader))
}

async function* sheepCounter(): BufferGenerator {
  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  for (let i = 0; i < 100; i++) {
    await sleep(1000)
    yield Buffer.from(`${i}\n`)
  }
}
