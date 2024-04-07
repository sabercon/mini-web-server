import * as net from "net"
import TCPConnection from "./base/tcp-connection"
import startTCPServer from "./base/tcp-server"
import DynamicBuffer from "./base/dynamic-buffer"

/**
 * Starts a TCP server using a simple protocol.
 *
 * Our protocol consists of messages separated by '\n' (the newline character).
 * The server reads messages and sends back replies using the same protocol.
 *
 * - If the client sends 'quit', reply with 'Bye.' and close the connection.
 * - Otherwise, echo the message back with the prefix 'Echo: '.
 */
export default function startEchoServer(options: net.ListenOptions) {
  startTCPServer(options, echo)
}

async function echo(conn: TCPConnection) {
  const buf = new DynamicBuffer()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const msg = cutMessage(buf)

    if (msg == null) {
      const data = await conn.read()
      if (data == TCPConnection.EOF) {
        console.log("EOF")
        return
      }
      buf.push(data)
      continue
    }

    if (msg.equals(QUIT_MSG)) {
      await conn.write(BYE_MSG)
      return
    }

    const reply = Buffer.concat([ECHO_MSG, msg])
    await conn.write(reply)
  }
}

function cutMessage(buffer: DynamicBuffer): null | Buffer {
  const msgEnd = buffer.data().indexOf("\n")
  return msgEnd < 0 ? null : buffer.pop(msgEnd + 1)
}

const QUIT_MSG = Buffer.from("quit\n")
const BYE_MSG = Buffer.from("Bye.\n")
const ECHO_MSG = Buffer.from("Echo: ")
