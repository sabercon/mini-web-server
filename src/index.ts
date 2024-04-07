import startEchoServer from "./message-echo-server"

console.log("Hello world!")
startEchoServer({ host: "127.0.0.1", port: 1234 })
