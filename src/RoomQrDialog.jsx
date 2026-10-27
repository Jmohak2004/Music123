import QRCode from "react-qr-code";

export default function RoomQrDialog({ code, name, url, onClose }) {
  return <div className="qr-overlay" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="qr-card" role="dialog" aria-modal="true" aria-labelledby="qr-title" aria-describedby="qr-description">
      <button type="button" className="close-dialog" aria-label="Close QR code" onClick={onClose}>×</button>
      <span className="section-label">Invite another device</span>
      <h2 id="qr-title">Scan to join {name}</h2>
      <p id="qr-description">Point a phone camera at this code. The join page opens with room {code} filled in.</p>
      <div className="qr-image" role="img" aria-label={`QR code for joining room ${code}`}>
        <QRCode value={url} size={224} level="M" />
      </div>
      <p className="qr-room-code">Room code <strong>{code}</strong></p>
      <a className="qr-link" href={url}>{url}</a>
    </section>
  </div>;
}
