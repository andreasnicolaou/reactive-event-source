# reactive-event-source

![GitHub package.json version](https://img.shields.io/github/package-json/v/andreasnicolaou/reactive-event-source)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/andreasnicolaou/reactive-event-source/build.yaml)
![GitHub License](https://img.shields.io/github/license/andreasnicolaou/reactive-event-source)

![NPM Downloads](https://img.shields.io/npm/dm/%40andreasnicolaou%2Freactive-event-source)

A lightweight reactive wrapper around EventSource using RxJS, providing automatic reconnection and buffering.

## Features

- Automatic reconnection with exponential backoff
- Type-safe event handling
- Buffered events (never miss the last message)
- Clean RxJS API with no callback hell
- Configurable retry strategies

## Installation

You can install the package via npm:

```bash
npm install @andreasnicolaou/reactive-event-source
```

## Usage

```ts
import { ReactiveEventSource } from '@andreasnicolaou/reactive-event-source';

const eventSource = new ReactiveEventSource('https://api.example.com/stream');

// Subscribe to standard events
eventSource.on('open').subscribe(() => console.log('Connected'));
eventSource.on('error').subscribe((err) => console.error('Error:', err));

eventSource.on('update').subscribe((event) => {
  console.log('New update:', event.data);
});

// Close when done
eventSource.close();
```

## API

### Constructor

| Signature                                                                            | Description                          |
| ------------------------------------------------------------------------------------ | ------------------------------------ |
| `new ReactiveEventSource(url: string \| URL, options?: Partial<EventSourceOptions>)` | Creates a new SSE connection manager |

### Options

| Property          | Type      | Default | Description                       |
| ----------------- | --------- | ------- | --------------------------------- |
| `maxRetries`      | `number`  | `3`     | Maximum retry attempts on failure |
| `initialDelay`    | `number`  | `1000`  | Initial retry delay in ms         |
| `maxDelay`        | `number`  | `10000` | Maximum retry delay in ms         |
| `withCredentials` | `boolean` | `false` | Send cookies with requests        |

### Methods

| Method                               | Returns                    | Description                                                                                       |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `.on(eventType: string = 'message')` | `Observable<MessageEvent>` | Returns hot observable that:<br>• Buffers last event<br>• Auto-reconnects<br>• Completes on close |
| `.close()`                           | `void`                     | Closes connection and cleans up resources                                                         |

### Properties

| Property           | Type      | Values                                      | Description                                                                         |
| ------------------ | --------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `.readyState`      | `number`  | `0`: CONNECTING<br>`1`: OPEN<br>`2`: CLOSED | Current connection state. Automatically updates during reconnections.               |
| `.withCredentials` | `boolean` | `true`/`false`                              | Indicates if credentials are sent with requests (set at construction)               |
| `.URL`             | `string`  | -                                           | Readonly resolved endpoint URL. Returns string even if constructed with URL object. |

### Observable Behavior

• Buffers last event (ReplaySubject)  
• Automatic reconnection  
• Completes when connection closes  
• Shared between subscribers

### Connection States

| State      | Value | Description             |
| ---------- | ----- | ----------------------- |
| CONNECTING | `0`   | Establishing connection |
| OPEN       | `1`   | Connection active       |
| CLOSED     | `2`   | Connection terminated   |

## Polyfill for Node.js / Legacy Environments

This library depends on the EventSource API, which is available in most modern browsers. If you're running in an environment where EventSource is not defined (such as Node.js), you can globally provide a compatible implementation:

```ts
// Only do this once, at the top level of your application
globalThis.EventSource = /* your EventSource-compatible implementation */;
```

## Contributing

Contributions are welcome! If you encounter issues or have ideas to enhance the library, feel free to submit an issue or pull request.
