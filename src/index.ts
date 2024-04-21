import startCallbackEchoServer from "./callback-echo-server"
import startAsyncEchoServer from "./async-echo-server"
import startMessageEchoServer from "./message-echo-server"
import startHTTPServer from "./http-server"

console.log("Hello world!")
startCallbackEchoServer({ host: "127.0.0.1", port: 8081 })
startAsyncEchoServer({ host: "127.0.0.1", port: 8082 })
startMessageEchoServer({ host: "127.0.0.1", port: 8083 })
startHTTPServer({ host: "127.0.0.1", port: 8080 })
