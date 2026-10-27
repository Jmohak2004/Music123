import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";

export default function RoomQrDialog({ code, name, url, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [copyStatus, setCopyStatus] = useState("");
  const localAddress = ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setCopyStatus("Link copied"); }
    catch { setCopyStatus("Use the link below to share this room."); }
  }
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...dialogRef.current.querySelectorAll("button, a[href]")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, []);
  return <div className="qr-overlay" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section ref={dialogRef} className="qr-card" role="dialog" aria-modal="true" aria-labelledby="qr-title" aria-describedby="qr-description">
      <button ref={closeRef} type="button" className="close-dialog" aria-label="Close QR code" onClick={onClose}>×</button>
      <span className="section-label">Invite another device</span>
      <h2 id="qr-title">Scan to join {name}</h2>
      <p id="qr-description">Point a phone camera at this code. The join page opens with room {code} filled in.</p>
      <div className="qr-image" role="img" aria-label={`QR code for joining room ${code}`}>
        <QRCode value={url} size={224} level="M" />
      </div>
      <p className="qr-room-code">Room code <strong>{code}</strong></p>
      {localAddress && <p className="qr-local-note">This address only works on this device. Open Echo at a reachable address to scan from another device.</p>}
      <button type="button" className="small-button" onClick={copyLink}>Copy join link</button>
      {copyStatus && <p role="status">{copyStatus}</p>}
      <a className="qr-link" href={url}>{url}</a>
    </section>
  </div>;
}
