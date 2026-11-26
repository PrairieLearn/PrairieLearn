# Question browser services

`QuestionBrowserServices` is the local API used by question UI code. Its promises,
callbacks, and abort signals stay in the UI's JavaScript context. The protocol in
`question-browser-services.protocol.ts` contains only structured-cloneable data.

The enabled same-document path already uses a real `MessageChannel`:

```text
question UI → client adapter → MessagePort → application host → HTTP / Socket.IO
```

The application host owns endpoint selection, credentials, and score/navigation
updates. It returns only question content through the port. The server continues
to authorize requests. Native form submission is unchanged.

## Operations and lifecycle

- A render request carries a request ID, submission ID, and purpose. Results and
  errors echo the request ID, so responses may arrive in any order. Internal error
  details are not forwarded.
- The client rejects immediately on cancellation and sends a cancel message. The
  host owns a separate abort controller. Late results are ignored. Cancellation
  cannot undo an application update that has already completed.
- Each grading subscription has an ID. Callbacks and unsubscribe functions stay
  local; only status data and subscribe/unsubscribe messages cross the port. The
  host shares one grading socket across listeners, replays the latest status to
  new listeners, and closes the socket when the last listener unsubscribes.
- Both endpoints validate incoming messages. Invalid messages close the connection.
- Disposal rejects pending client requests, aborts host requests, and closes
  subscriptions and ports. The application must dispose the host when replacing a
  view, without relying on a goodbye message from the question. The host's
  `isCurrent` check also prevents obsolete work from updating application panels.

## Connecting an iframe

`serveQuestionServicesFrame` and `connectQuestionServicesToParent` implement the
window handshake. The application installs the frame listener before loading the
frame, using its configured exact question origin. The frame supplies its configured
exact application origin. The listener validates both origin and source window
before transferring a port. A connection ID associates the reply with the current
handshake. The child rejects a handshake that does not complete within ten seconds.
Opaque origins and wildcard destinations are not supported.

Once transferred, possession of the dedicated port identifies the connection;
`MessagePort` messages do not carry window origin/source checks. Each port is bound
to one application-created host. Initialization data containing URLs and credentials
stays in the application and is never sent to the frame.

On a new handshake, the application disposes the previous host and creates a fresh
one. The page owner must also dispose its frame connection before replacing or
navigating the question view. The frame owns the returned client and disposes it
when its UI is removed. Closing a port alone does not notify the peer: use the
returned disposal functions. There is no automatic replay or reconnection of
operations, since future operations may have side effects.

Iframe delivery is not enabled by this PR. When it is introduced, its page bootstrap
will use these connection helpers instead of constructing both endpoints in one
document. That integration must supply the configured origins and view lifecycle;
individual operations do not implement their own window listeners.

The iframe integration must also retire the old host after child-initiated
navigation, including navigation to a document that never sends a ready message.
An attached iframe element does not imply that its original document is still
active. This requires a document-lifecycle policy in the iframe delivery work;
owner-initiated disposal alone does not cover it. Verify handshake/load ordering
before using a load listener, so initial loading does not dispose a new connection.

## Adding an operation

Add its data schema to the protocol unions, expose its local UI method on
`QuestionBrowserServices`, and implement the client and host dispatch cases. Reuse
request IDs, cancellation, error handling, and disposal. Add an application host
handler that derives URLs and credentials from its own view configuration. Do not
accept arbitrary HTTP endpoints, parent HTML, or method names to invoke dynamically.
For a subscription, use the same subscription ID and local callback pattern as
grading status. Keep operation-specific tests with the operation; transport tests
cover message correlation, cancellation, subscriptions, and connection
setup independently of rendering and grading behavior.
