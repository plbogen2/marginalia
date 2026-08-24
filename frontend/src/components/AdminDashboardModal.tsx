import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Users, HardDrive, Cpu, Activity, Volume2, ShieldAlert } from 'lucide-react';

interface AdminDashboardModalProps {
  onClose: () => void;
}

interface AdminMetrics {
  overview: {
    totalUsers: number;
    activeUsers24h: number;
    activeUsers7d: number;
    totalStorageBytes: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
  };
  userStorage: { user: string; sizeBytes: number }[];
  aiUsage: {
    byFeature: { feature: string; total_tokens: number; count: number }[];
    byModel: { model: string; total_tokens: number; count: number }[];
    timeSeries: { date: string; total_tokens: number; count: number }[];
  };
  features: { feature: string; count: number }[];
  recentActivity: {
    id: number;
    user: string;
    event_type: string;
    feature: string;
    metadata: string | null;
    created_at: number;
  }[];
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ onClose }) => {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'ai' | 'users' | 'activity'>('overview');

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/metrics');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access denied: Admin privileges required.');
        }
        throw new Error(`Failed to load metrics (${res.status})`);
      }
      const data = await res.json();
      setMetrics(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load telemetry metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTokens = (tokens: number) => {
    if (!tokens) return '0';
    if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(2) + 'M';
    if (tokens >= 1_000) return (tokens / 1_000).toFixed(1) + 'k';
    return tokens.toLocaleString();
  };

  const formatTimestamp = (sec: number) => {
    const d = new Date(sec * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-dashboard-modal" style={{ maxWidth: '880px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity className="icon" size={20} />
            <h2>Marginalia Admin Monitor</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-icon"
              onClick={fetchMetrics}
              title="Refresh telemetry"
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? 'spinning' : ''} />
            </button>
            <button className="btn-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="modal-body">
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-danger, #ef4444)' }}>
              <ShieldAlert size={40} style={{ margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600 }}>{error}</p>
            </div>
          </div>
        ) : loading && !metrics ? (
          <div className="modal-body" style={{ padding: '40px', textAlign: 'center' }}>
            <RefreshCw size={32} className="spinning" style={{ margin: '0 auto 16px', opacity: 0.7 }} />
            <p>Gathering system telemetry...</p>
          </div>
        ) : metrics ? (
          <div className="modal-body" style={{ padding: '20px' }}>
            {/* Quick Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              
              <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Users & Activity</span>
                  <Users size={16} style={{ color: '#3b82f6' }} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{metrics.overview.totalUsers}</div>
                <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '4px' }}>
                  {metrics.overview.activeUsers24h} active in 24h · {metrics.overview.activeUsers7d} in 7d
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>AI Tokens</span>
                  <Cpu size={16} style={{ color: '#8b5cf6' }} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{formatTokens(metrics.overview.totalTokens)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {formatTokens(metrics.overview.promptTokens)} in / {formatTokens(metrics.overview.completionTokens)} out
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Workspace Storage</span>
                  <HardDrive size={16} style={{ color: '#ec4899' }} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{formatBytes(metrics.overview.totalStorageBytes)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  across {metrics.userStorage.length} workspaces
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Parlando & Events</span>
                  <Volume2 size={16} style={{ color: '#06b6d4' }} />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                  {metrics.features.reduce((acc, f) => acc + f.count, 0)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  recorded feature actions
                </div>
              </div>

            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <button
                className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                onClick={() => setActiveTab('overview')}
              >
                Overview & Features
              </button>
              <button
                className={`btn ${activeTab === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                onClick={() => setActiveTab('ai')}
              >
                AI & Model Usage
              </button>
              <button
                className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                onClick={() => setActiveTab('users')}
              >
                Storage by User
              </button>
              <button
                className={`btn ${activeTab === 'activity' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                onClick={() => setActiveTab('activity')}
              >
                Live Activity Log
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'overview' && (
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)' }}>Feature Usage Breakdown</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                  {metrics.features.map((f) => (
                    <div key={f.feature} style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>
                        {f.feature.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-color, #3b82f6)' }}>
                        {f.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)' }}>AI Usage by Feature</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                  {metrics.aiUsage.byFeature.map((f) => (
                    <div key={f.feature} style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>
                        {f.feature.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, margin: '4px 0', color: '#8b5cf6' }}>
                        {formatTokens(f.total_tokens)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>tokens</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {f.count} API calls
                      </div>
                    </div>
                  ))}
                </div>

                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)' }}>Tokens by Model</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                  {metrics.aiUsage.byModel.map((m) => (
                    <div key={m.model} style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{m.model}</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, margin: '4px 0', color: '#3b82f6' }}>
                        {formatTokens(m.total_tokens)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>tokens</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.count} generations</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)' }}>Storage & Workspaces per User</h4>
                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '8px' }}>User</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Disk Space</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.userStorage.map((u) => (
                        <tr key={u.user} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '8px', fontWeight: 500 }}>{u.user}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{formatBytes(u.sizeBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'activity' && (
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-primary)' }}>Recent System Events</h4>
                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {metrics.recentActivity.map((act) => (
                    <div key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '0.8rem' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{act.user}</span>
                        <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>·</span>
                        <span style={{ color: '#06b6d4', textTransform: 'capitalize' }}>{act.feature.replace(/_/g, ' ')}</span>
                        <span style={{ margin: '0 6px', color: 'var(--text-secondary)' }}>·</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{act.event_type}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {formatTimestamp(act.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        ) : null}

        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>

      </div>
    </div>
  );
};
