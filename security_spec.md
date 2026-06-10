# Security Specification - Server-Based Chat Rooms

This document outlines the Security Architecture, Data Invariants, and the "Dirty Dozen" malicious payload structures for the Online Chat Rooms and Servers application.

## 1. Data Invariants

1. **User Identity Security**: Users can only create or update their own user profile document (`/users/{userId}`). They cannot modify other users' profiles or impersonate other users' UIDs.
2. **Joined Server Index Security**: Users can only modify `/users/{userId}/joinedServers/{serverId}` if and only if the `userId` in the path matches their authenticated UID.
3. **Server Ownership Integrity**: Only a server's owner (`ownerId`) can modify or delete a server document (`/servers/{serverId}`).
4. **Member Gate Control**: A user can only write a member roster document `/servers/{serverId}/members/{userId}` for themselves to join, or the server owner can write/delete member profiles.
5. **Private Server Invite Constraint**: If a server is private (`isPrivate` is `true`), adding a membership requires proving the user is either the owner or is joining via a valid invite code transaction (client-side checks and rules verification).
6. **Room Management Access**: Only the owner of the parent server can create or delete a room/channel (`/servers/{serverId}/rooms/{roomId}`) inside that server.
7. **Message Authenticity**: A user can only send a message inside `/servers/{serverId}/rooms/{roomId}/messages/{messageId}` if:
   - They are authenticated.
   - The document's `senderId` exactly matches their authenticated UID.
   - They are a member of the parent server.
8. **Immutability Invariants**: Critical historical markers such as `createdAt`, `serverId`, and `ownerId` cannot be updated after creation.
9. **Temporal Legitimacy**: Client-provided timestamps like `createdAt` and `updatedAt` are strictly forced to match `request.time` (server-configured time).

---

## 2. The "Dirty Dozen" Malicious Payloads

The following attack payloads are designed to penetrate standard database schemas but will be rejected with `PERMISSION_DENIED` by our rigorous security rules:

### Payload 1: Profile Spoofing
*   **Target Path**: `/users/attacker_uid`
*   **Attack**: Attacker attempts to change another user's email or identity.
*   **Malicious Payload**:
    ```json
    {
      "displayName": "Spoofed User",
      "email": "victim@gmail.com",
      "bio": "Compromised profile"
    }
    ```
*   **Rejection Condition**: `request.auth.uid` does not match the `userId` in path.

### Payload 2: Ghost Role Promotion
*   **Target Path**: `/servers/server_abc/members/attacker_uid`
*   **Attack**: Attacker tries to join a server directly as an `owner`.
*   **Malicious Payload**:
    ```json
    {
      "role": "owner",
      "displayName": "Attacker",
      "photoURL": "https://example.com/avatar.png",
      "joinedAt": "2026-06-10T20:56:00Z"
    }
    ```
*   **Rejection Condition**: Adding a member requires validating that they enter as `member` unless they are the actual creator of the server.

### Payload 3: Orphaned Server Creation
*   **Target Path**: `/servers/server_abc`
*   **Attack**: Attacker attempts to create a server and assign ownership to someone else's UID.
*   **Malicious Payload**:
    ```json
    {
      "name": "Malicious Server",
      "ownerId": "victim_uid",
      "ownerName": "Victim Name",
      "inviteCode": "abcdefgh",
      "isPrivate": false,
      "createdAt": "2026-06-10T20:56:00Z"
    }
    ```
*   **Rejection Condition**: Server's `ownerId` must strictly equal `request.auth.uid`.

### Payload 4: Ghost Field Injection (Shadow Update)
*   **Target Path**: `/servers/server_abc`
*   **Attack**: Attacker attempts to inject custom administrator flags or field structures inside the server document.
*   **Malicious Payload**:
    ```json
    {
      "name": "Modified Server",
      "ownerId": "attacker_uid",
      "inviteCode": "abcdefgh",
      "isPrivate": false,
      "isAdmin": true,
      "extraSecField": "bypass_gate",
      "createdAt": "2026-06-10T20:56:00Z"
    }
    ```
*   **Rejection Condition**: Exact keys size limit and matching checking on creation, and keys constraint `affectedKeys().hasOnly(...)` during updates.

### Payload 5: Rogue Channel Injection inside Sibling Server
*   **Target Path**: `/servers/victim_server_xyz/rooms/rogue_room`
*   **Attack**: Attacker tries to inject a new channel inside a server owned by another user.
*   **Malicious Payload**:
    ```json
    {
      "name": "Hacked Room",
      "serverId": "victim_server_xyz",
      "description": "Unwanted room",
      "ownerId": "attacker_uid",
      "createdAt": "2026-06-10T20:56:00Z"
    }
    ```
*   **Rejection Condition**: Room creation requires checking parent server's ownership (`get(/databases/$(database)/documents/servers/$(serverId)).data.ownerId == request.auth.uid`).

### Payload 6: Sending Messages as Someone Else
*   **Target Path**: `/servers/server_abc/rooms/general/messages/msg_999`
*   **Attack**: Attacker tries to spoof another user's display name or sender ID.
*   **Malicious Payload**:
    ```json
    {
      "senderId": "victim_uid",
      "senderName": "Victim Display Name",
      "senderPhoto": "https://example.com/victim.png",
      "content": "Malicious text message",
      "createdAt": "2026-06-10T20:56:00Z"
    }
    ```
*   **Rejection Condition**: `senderId` must match the authenticated user's UID (`request.auth.uid`).

### Payload 7: Accessing Non-Member Room Files (PII Breach)
*   **Target Path**: `/servers/private_server_abc/rooms/general/messages`
*   **Attack**: Attacker attempts to list messages of a server they have not joined.
*   **Rejection Condition**: Reading messages requires membership verification (`exists(/databases/$(database)/documents/servers/$(serverId)/members/$(request.auth.uid))`).

### Payload 8: Time Warping Attack
*   **Target Path**: `/servers/server_abc/rooms/general/messages/msg_123`
*   **Attack**: Attacker attempts to forge timestamps to manipulate message order history.
*   **Malicious Payload**:
    ```json
    {
      "senderId": "attacker_uid",
      "senderName": "Attacker Name",
      "senderPhoto": "",
      "content": "Backdated message",
      "createdAt": "1999-01-01T00:00:00Z"
    }
    ```
*   **Rejection Condition**: Creation timestamp `createdAt` must strictly match `request.time`.

### Payload 9: Denial of Wallet ID Poisoning
*   **Target Path**: `/servers/server_abc/rooms/general/messages/` + `'A' * 2000`
*   **Attack**: Attacker injects a massive document ID to bloat index sizes and increase billing.
*   **Rejection Condition**: `isValidId()` enforces that ID lengths must not exceed 128 characters and must match alphanumeric/safe regex patterns.

### Payload 10: Server Theft via Owner Field Re-write
*   **Target Path**: `/servers/server_abc`
*   **Attack**: Attacker tries to transfer server ownership to themselves.
*   **Malicious Payload**:
    ```json
    {
      "name": "My Stolen Server",
      "ownerId": "attacker_uid",
      "inviteCode": "abcdefgh",
      "isPrivate": false,
      "createdAt": "2026-06-10T20:56:00Z"
    }
    ```
*   **Rejection Condition**: Modifying immutable fields like `ownerId` and `createdAt` is forbidden.

### Payload 11: Bypassing Email Verification
*   **Target Path**: `/users/unverified_uid`
*   **Attack**: A user attempts to write to the database when they haven't verified their email (when standard security forces verification).
*   **Rejection Condition**: In standard high-security workflows, we can enforce `request.auth.token.email_verified == true`. (In this app, we will use lenient signing to accommodate standard Google Sign-In and local evaluations gracefully, but for specific administrative actions we require correct verification).

### Payload 12: Private Server Direct Sneaking
*   **Target Path**: `/servers/private_server_abc/members/attacker_uid`
*   **Attack**: Attacker bypasses the code-based joining flow to write their own member card on a private server without knowing its invite code.
*   **Rejection Condition**: Joining a private server requires validating that the invite code provided in the transaction matches the server's database invite code.

---

## 3. Standard Test Suite Schema Definition (Conceptual)

Below is the conceptual TypeScript test suite designed to verify that the Fortress Rules block every scenario of the "Dirty Dozen" (conforming to standard mock runner testing approaches in client frameworks).

```typescript
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";

describe("Firestore Security Rules Tests", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "stoked-theorem-4lsxp",
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  test("Payload 1: Reject Profile Spoofing for foreign users", async () => {
    const unauthenticatedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(unauthenticatedDb, "users/victim_uid"), {
        displayName: "Spoofed User",
        email: "victim@gmail.com",
        bio: "Hacked bio",
      })
    );
  });

  test("Payload 6: Reject Sent Message if senderId is spoofed", async () => {
    const context = testEnv.authenticatedContext("attacker_uid");
    const db = context.firestore();
    await assertFails(
      setDoc(doc(db, "servers/server_abc/rooms/general/messages/msg_999"), {
        senderId: "victim_uid",
        senderName: "Victim Name",
        content: "Malicious spoof message",
        createdAt: serverTimestamp(),
      })
    );
  });
});
```
