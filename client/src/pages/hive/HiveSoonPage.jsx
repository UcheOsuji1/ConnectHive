export default function HiveSoonPage({ feature = 'This feature' }) {
  return (
    <div className="hdl-soon-page">
      <div className="hdl-soon-icon">🔜</div>
      <h2 className="hdl-soon-title">{feature} is coming soon</h2>
      <p className="hdl-soon-sub">
        We're building something great. Check back soon.
      </p>
    </div>
  );
}
