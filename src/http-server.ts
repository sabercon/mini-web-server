import net from "net"
import fs from "fs/promises"
import ContentReader from "./base/content-reader"
import TCPConnection from "./tcp/tcp-connection"
import startTCPServer from "./tcp/tcp-server"
import { HTTPError, serveHTTP } from "./http/common"
import HTTPRequest from "./http/http-request"
import HTTPResponse from "./http/http-response"

export default function startHTTPServer(options: net.ListenOptions) {
  startTCPServer(options, handleHTTPConnection)
}

async function handleHTTPConnection(conn: TCPConnection) {
  await serveHTTP(conn, handleHTTPRequest)
}

async function handleHTTPRequest(req: HTTPRequest): Promise<HTTPResponse> {
  const { method, uri } = req.head
  let reader: ContentReader
  if (["POST", "PUT"].includes(method) && uri == "/echo") {
    reader = req.body
  } else if (method == "GET" && uri == "/sheep") {
    reader = ContentReader.fromGenerator(sheepCounter())
  } else if (["HEAD", "GET"].includes(method) && uri.startsWith("/files/")) {
    // serves files from the current working directory
    // FIXME: prevent escaping by `..`
    const path = uri.substring("/files/".length)
    const f = await openFile(path)
    if (f == null) {
      throw new HTTPError(404, "Not Found")
    }

    reader = ContentReader.fromFile(...f)
  } else {
    reader = ContentReader.fromBuffer(Buffer.from("Hello World!"))
  }

  return HTTPResponse.ok(req.head, [], reader)
}

async function* sheepCounter(): AsyncGenerator<Buffer, void, void> {
  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  for (let i = 0; i < 100; i++) {
    await sleep(1000)
    yield Buffer.from(`${i}\n`)
  }
}

async function openFile(path: string): Promise<[fs.FileHandle, number] | null> {
  let fp: fs.FileHandle
  try {
    fp = await fs.open(path, "r")
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code == "ENOENT") {
      return null
    }
    throw error
  }

  try {
    const stat = await fp.stat()
    if (!stat.isFile()) {
      return null
    }

    return [fp, stat.size]
  } catch (error) {
    await fp.close()
    throw error
  }
}
