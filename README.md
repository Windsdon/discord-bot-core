# discord-bot-core
discord-bot-core is a modular bot for Discord servers

Top features include:
- Completely modular design
- Built-in server-specific permission system
  - You can add people to roles, or link them to server roles.
  - Each subcommand can have a different permission
- Parser with argument types
  - Your command doesn't get called unless all required arguments are present, so you don't need to check that!
- Self-generated help
  - You provide a help string for each subcommand, and the command signature is generated from the argument list
- Simple interface to respond to messages
  - You can just call `e.mention().respond("Hello!")` to generate `@Windsdon Hello!`
- Server-specific databases (or you can make it global)

More documentation to come.

# Changelog

**v0.5.0**
- Added `plugins/plugins.txt`
  - Used as a load list
  - Can be used to load modules installed using npm
    - If `plugins/<mod>` isn't a folder, tries `require(<mod>)`
  - Created with plugin folder if doesn't exist
- Renamed plugin constructor to `init` (was `f`)
- Changed the `addCommandControlHandler` interface
  - Renamed to `addCommandHandler`
  - Removed the `data` argument (if you want to pass custom data, we recommend using `async.apply(fn, data)`)
  - New signature: `addCommandHandler(handler, type)`
  - The callback given to the handlers is `callback(err)`
    - If you provide `err.message` and not set `err.silent`, the message is sent to the user
  - Handler signature is `fn(o, callback)`. Properties of `o` are set as they are created. See details bellow.
  - Valid types:
    - `start`: called before anything is processed.
    - `parsed`: called after the parser returns (adds `obj` to `o`)
    - `end`: called after permissions are checked (adds `e` to `o`)
- `onMessage` now runs on a Fiber
- Added `e.deleteMessage([id,] callback)`
- Added `e.getRoles([uid], [sid])`
  - Defaults to e's uid and sid. If uid is `null`, returns all server roles
- Added `e.getRole(rid, [sid])`
  - Make sid `null` or `false` to search globally, otherwise will only search on e's server
- Added `e.roleName(rid, [sid])`
  - Same as above
- Updated help command
  - Now suggest subcommands even if there is a parent command
- Fixed #3 and #6
  - Most `(group, sid)` argument pairs on PluginManager's functions accept the format `group = "sid:group", sid = undefined`
  - Fixed validation on group names
- Message queues are now channel based

```javascript
var o = {
    user: user,
    userID: userID,
    channelID: channelID,
    message: message,
    rawEvent: rawEvent,
    _disco: self, // the current DiscordBot instance
    obj: parsedObject, // the object returned from the parser
    e: e // the DiscordBotMessage object
};
```
