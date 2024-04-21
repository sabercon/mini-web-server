# Mini Web Server

A mini web server built by following
[Build Your Own Web Server From Scratch In Node.JS](https://build-your-own.org/webserver/).

## Getting started

To start up all the servers:

```shell
$ npm run start
```

## Testing TCP Server

To test the TCP server using callback to echo back the data:

```shell
$ nc localhost 8081
```

To test the TCP server using async/await to echo back the data:

```shell
$ nc localhost 8082
```

To test the TCP server echoing back the data by message:

```shell
$ nc localhost 8083
```

## Testing HTTP Server

To test the default response:

```shell
$ curl -vvv http://localhost:8080
```

To test the echo response:

```shell
$ curl -vvv --data-binary 'hello' http://localhost:8080/echo
```

To test the echo response using chunked request:

```shell
$ curl -vvv -T- http://localhost:8080/echo
```

To test the sheep counting using chunked response:

```shell
$ curl -vvv http://localhost:8080/sheep
```

To test static file serving:

```shell
$ curl -vvv http://localhost:8080/files/README.md
```

To test static file serving using HEAD method:

```shell
$ curl -vvv -I http://localhost:8080/files/README.md
```

To test 404 response when the file is not found:

```shell
$ curl -vvv http://localhost:8080/files/UNKNOWN.md
```

To test compressed response:

```shell
$ curl -vvv --compressed http://localhost:8080
```
