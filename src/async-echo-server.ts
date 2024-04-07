import * as net from "net"

interface TCPConnection {
  // the JS socket object
  socket: net.Socket
  // from the 'error' event
  err?: Error
  // EOF, from the 'end' event
  ended: boolean
  // the callbacks of the promise of the current read
  reader: null | {
    resolve: (value: Buffer) => void
    reject: (error: Error) => void
  }
}

const EOF = Buffer.from("")

/**
 * Starts a TCP server that reads data from clients and writes the same data back
 */
export default function startEchoServer(options: net.ListenOptions) {
  const server = net.createServer({ pauseOnConnect: true })
  server.on("connection", handleConnection)
  server.listen(options)
}

async function handleConnection(socket: net.Socket) {
  console.log("new connection:", socket.remoteAddress, socket.remotePort)

  try {
    await echo(socket)
  } catch (err) {
    console.error(err)
  } finally {
    socket.destroy()
  }
}

async function echo(socket: net.Socket) {
  const conn = socketInit(socket)
  while (true) {
    const data = await socketRead(conn)
    if (data == EOF) {
      console.log("EOF")
      break
    }

    console.log("data:", data.toString())
    await socketWrite(conn.socket, data)
  }
}

function socketInit(socket: net.Socket): TCPConnection {
  const conn: TCPConnection = {
    socket: socket,
    ended: false,
    reader: null,
  }
  socket.on("data", (data) => {
    console.assert(conn.reader)
    // pauses the 'data' event until the next read
    conn.socket.pause()
    // fulfills the promise of the current read
    conn.reader!.resolve(data)
    conn.reader = null
  })
  socket.on("end", () => {
    conn.ended = true
    if (conn.reader) {
      conn.reader.resolve(EOF)
      conn.reader = null
    }
  })
  socket.on("error", (err: Error) => {
    conn.err = err
    if (conn.reader) {
      conn.reader.reject(err)
      conn.reader = null
    }
  })
  return conn
}

function socketRead(conn: TCPConnection): Promise<Buffer> {
  console.assert(!conn.reader) // no concurrent calls
  return new Promise((resolve, reject) => {
    // if the connection is not readable, completes the promise
    if (conn.err) {
      reject(conn.err)
      return
    }
    if (conn.ended) {
      resolve(EOF)
      return
    }

    // saves the promise callbacks
    conn.reader = { resolve: resolve, reject: reject }
    // and resumes the 'data' event to fulfill the promise later
    conn.socket.resume()
  })
}

function socketWrite(socket: net.Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}
