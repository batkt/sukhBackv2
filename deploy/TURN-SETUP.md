# TURN setup — making the camera stream reliable

## Why

Diagnosed from the SDP exchanged on 2026-08-11:

| | Browser (mobile viewer) | R2W server (site PC) |
|---|---|---|
| IPv4 | `66.181.188.135`, mapped port **changes every attempt** | `59.153.113.165:10079` (local port 49712 → translated) |
| IPv6 | `2405:5700:311:39aa:…` | `2405:5700:300:5b34:…` (port **not** translated) |
| relay | none | none |

- **IPv4 can't work.** Both ends are behind port-translating NAT and the mobile
  side is symmetric (mapped port differs per attempt). Hole punching fails.
- **IPv6 is the only direct path that works** — no NAT touches it.
- **Neither side offered a `typ relay` candidate**, so when IPv6 is unavailable
  there is no fallback and the player just shows nothing.

TURN removes the dependency on IPv6 being healthy: both peers make *outbound*
connections to the relay, which always works through NAT.

## 1. Install coturn on the VPS (103.236.194.99)

```bash
sudo apt update && sudo apt install -y coturn
sudo sed -i 's/^#TURNSERVER_ENABLED/TURNSERVER_ENABLED/' /etc/default/coturn
```

Copy `turnserver.conf` from this directory to `/etc/turnserver.conf`, then
generate a password and append the credential:

```bash
PW=$(openssl rand -base64 24); echo "user=zevturn:$PW" | sudo tee -a /etc/turnserver.conf; echo "PASSWORD: $PW"
```

Save that password — it goes in two places (steps 3 and 4).

```bash
sudo systemctl enable --now coturn && sudo systemctl status coturn --no-pager
```

## 2. Open the firewall

```bash
sudo ufw allow 3478/tcp && sudo ufw allow 3478/udp && sudo ufw allow 5349/tcp && sudo ufw allow 5349/udp && sudo ufw allow 49160:49200/udp
```

If the VPS also has a cloud-provider firewall/security group, open the same
ports there — otherwise coturn starts fine and silently never relays.

## 3. Frontend (sukhWeb)

Add to `.env.production` (and `.env.local` for dev):

```
NEXT_PUBLIC_TURN_URL=amarhome.mn
NEXT_PUBLIC_TURN_USER=zevturn
NEXT_PUBLIC_TURN_PASS=<the password from step 1>
```

Then rebuild/redeploy. `WebRTCVideoPlayer.tsx` picks these up automatically; if
they're absent it falls back to STUN-only (current behaviour), so a missing env
var degrades rather than breaks.

## 4. R2W server (site PC, port 8083)

Edit its `config.json` and set:

```json
{
  "ice_servers": [
    "stun:stun.l.google.com:19302",
    "turn:amarhome.mn:3478"
  ],
  "ice_username": "zevturn",
  "ice_credential": "<the password from step 1>"
}
```

Restart the R2W process. **Both sides must have TURN** — ICE is symmetric, a
relay only helps if both peers know about it.

## 5. Reduce ICE noise on the site PC (recommended)

That box advertises six IPv6 privacy addresses, most deprecated. ICE grinds
through the dead ones and can time out before reaching the live one. In an
elevated PowerShell:

```powershell
netsh interface ipv6 set global randomizeidentifiers=disabled
netsh interface ipv6 set privacy state=disabled
```

## 6. Verify

Reload the camera page and watch `dahua-service` logs. You want to see `relay`
appear in the candidate summary:

```
📹 [STREAM xxxxxxxx] offer  browser-ice: host(mdns):… srflx:66.181.188.135 relay:103.236.194.99
✅ [STREAM xxxxxxxx] answer server-ice: host:192.168.1.56 srflx:59.153.113.165 relay:103.236.194.99
```

`relay:` on **both** lines means the fallback is live. If it's missing on one
side, that side's TURN config didn't take.

To confirm coturn is actually relaying:

```bash
sudo journalctl -u coturn -f
```

You should see `allocation` entries when a stream starts.

## Cost note

Relayed media flows through the VPS, so it uses VPS bandwidth — roughly
0.3–1 Mbps per active viewer on a sub-stream. TURN is only used when the direct
path fails, so healthy IPv6 viewers still connect peer-to-peer and cost nothing.
