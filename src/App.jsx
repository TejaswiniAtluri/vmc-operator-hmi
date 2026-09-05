import { useEffect, useMemo, useState } from 'react';

const SIDEBAR_ITEMS = [
  'Dashboard',
  'Jobs/Programs',
  'Machine',
  'Tools',
  'Alarms',
  'Production',
  'Maintenance',
  'Settings',
];

const STAGES = [
  { key: 'powerOn', label: 'Power On' },
  { key: 'machineChecks', label: 'Machine Checks' },
  { key: 'tools', label: 'Tools' },
  { key: 'workpiece', label: 'Workpiece' },
  { key: 'readyReview', label: 'Ready' },
  { key: 'operation', label: 'Operation' },
];

const apiRequest = async (path, options = {}) => {
  const API_BASE = "https://vmc-operator-hmi-u45x.onrender.com";

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data;
};

const formatTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function App() {
  const [session, setSession] = useState(null);
  const [selectedNav, setSelectedNav] = useState('Dashboard');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [paused, setPaused] = useState(false);
  const [metrics, setMetrics] = useState({
    spindleSpeed: 8200,
    feedRate: 1820,
    spindleLoad: 68,
    temperature: 72,
    coolant: 84,
    vibration: 0.26,
    tool: 'T04',
  });
  const [jobProgress, setJobProgress] = useState(0);

  const refreshSession = async () => {
    try {
      const data = await apiRequest('/api/session');
      setSession(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to load session');
    }
  };

  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((previous) => {
        const intensity = paused ? 0.7 : 1;
        return {
          spindleSpeed: Math.max(0, Math.round(previous.spindleSpeed + (paused ? -15 : 28) * intensity)),
          feedRate: Math.max(0, Math.round(previous.feedRate + (paused ? -8 : 15) * intensity)),
          spindleLoad: Math.max(15, Math.min(99, Math.round(previous.spindleLoad + (paused ? -1 : 2)))),
          temperature: Math.max(55, Math.min(95, Math.round(previous.temperature + (paused ? -1 : 2)))),
          coolant: Math.max(40, Math.min(100, Math.round(previous.coolant + (paused ? -2 : 1)))),
          vibration: Math.max(0.1, Math.min(1.2, Number((previous.vibration + (paused ? -0.02 : 0.03)).toFixed(2)))),
          tool: previous.tool,
        };
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    let progInterval;
    const running = session?.session?.operationStatus === 'RUNNING' && !paused;
    if (running) {
      progInterval = setInterval(() => {
        setJobProgress((p) => Math.min(100, Number((p + 1).toFixed(2))));
      }, 1000);
    }

    // reset progress when operation not running and session reset occurs
    if (!running && session?.session?.currentStage === 'powerOn') {
      setJobProgress(0);
    }

    return () => clearInterval(progInterval);
  }, [session?.session?.operationStatus, paused, session?.session?.currentStage]);

  const handlePowerOn = async () => {
    try {
      await apiRequest('/api/power-on/confirm', { method: 'POST' });
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Unable to confirm power on');
    }
  };

  const operationStatus = session?.session?.operationStatus || 'READY';
  const machineState = paused ? 'PAUSED' : operationStatus;
  const currentStage = session?.session?.currentStage || 'powerOn';
  const currentStageIndex = STAGES.findIndex((stage) => stage.key === currentStage);
  const powerOnComplete = Boolean(session?.session?.powerOnConfirmed);
  const machineChecksComplete = session?.machineChecks?.every((item) => item.confirmed) ?? false;
  const toolsComplete = session?.tools?.every((tool) => tool.confirmed) ?? false;
  const workpieceComplete = Boolean(session?.workpiece?.confirmed);
  const readyComplete = machineChecksComplete && toolsComplete && workpieceComplete;
  const nextEnabled = useMemo(() => {
    if (currentStage === 'powerOn') return powerOnComplete;
    if (currentStage === 'machineChecks') return machineChecksComplete;
    if (currentStage === 'tools') return toolsComplete;
    if (currentStage === 'workpiece') return workpieceComplete;
    if (currentStage === 'readyReview') return readyComplete;
    return false;
  }, [currentStage, powerOnComplete, machineChecksComplete, toolsComplete, workpieceComplete, readyComplete]);

  const handleConfirmCheck = async (id) => {
    try {
      await apiRequest(`/api/checks/${id}/confirm`, { method: 'POST' });
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Unable to confirm check');
    }
  };

  const handleConfirmTool = async (id) => {
    try {
      await apiRequest(`/api/tools/${id}/confirm`, { method: 'POST' });
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Unable to confirm tool');
    }
  };

  const handleConfirmWorkpiece = async () => {
    try {
      await apiRequest('/api/workpiece/confirm', { method: 'POST' });
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Unable to confirm workpiece setup');
    }
  };

  const handleNext = async () => {
    if (!nextEnabled) return;
    try {
      await apiRequest('/api/stage/next', { method: 'POST' });
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Unable to advance stage');
    }
  };

  const handleStartOperation = async () => {
    try {
      await apiRequest('/api/operation/start', { method: 'POST' });
      setPaused(false);
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Unable to start operation');
    }
  };

  const handleStopOperation = async () => {
    try {
      await apiRequest('/api/operation/stop', { method: 'POST' });
      setPaused(false);
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Unable to stop operation');
    }
  };

  const handleResetCycle = async () => {
    try {
      await apiRequest('/api/session/reset', { method: 'POST' });
      setPaused(false);
      setConfirmAction(null);
      setJobProgress(0);
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Unable to reset the cycle');
    }
  };

  const handleControlAction = (action) => {
    if (action === 'START') {
      handleStartOperation();
      return;
    }
    if (action === 'PAUSE') {
      setPaused(true);
      return;
    }
    if (action === 'STOP') {
      setConfirmAction('STOP');
      return;
    }
    if (action === 'RESET') {
      setConfirmAction('RESET');
    }
  };

  const confirmModal = async () => {
    if (confirmAction === 'STOP') {
      await handleStopOperation();
    }
    if (confirmAction === 'RESET') {
      await handleResetCycle();
    }
    setConfirmAction(null);
  };

  const renderWorkflowStage = () => {
    if (!session) return null;

    if (currentStage === 'powerOn') {
      return (
        <div className="action-card workflow-card">
          <div className="section-header">
            <span>Stage 00</span>
            <strong>Power On</strong>
          </div>
          <div className="power-panel">
            <div className="power-banner">POWER ON</div>
            <p>Verify main power available, control cabinet online, and machine ready for startup.</p>
            <button className="action-btn primary" onClick={handlePowerOn} disabled={powerOnComplete}>
              {powerOnComplete ? 'Power On Confirmed' : 'Power On & Continue'}
            </button>
            <div className="stage-actions">
              <button className="action-btn secondary" onClick={handleNext} disabled={!nextEnabled}>
                {currentStage === 'readyReview' ? 'Proceed to Operation' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (currentStage === 'machineChecks') {
      return (
        <div className="action-card workflow-card">
          <div className="section-header">
            <span>Stage 02</span>
            <strong>Machine Checks</strong>
          </div>
          <div className="stack-list">
            {session.machineChecks.map((check) => (
              <div key={check.id} className={`list-row ${check.confirmed ? 'done' : ''}`}>
                <div className="row-main">
                  <span className="check-indicator">{check.confirmed ? '✓' : ''}</span>
                  <span>{check.item}</span>
                </div>
                <button className="action-btn primary" onClick={() => handleConfirmCheck(check.id)} disabled={check.confirmed}>
                  {check.confirmed ? 'Confirmed' : 'Confirm Check'}
                </button>
              </div>
            ))}
          </div>
          <div className="stage-actions">
            <button className="action-btn secondary" onClick={handleNext} disabled={!nextEnabled}>
              {currentStage === 'readyReview' ? 'Proceed to Operation' : 'Next'}
            </button>
          </div>
        </div>
      );
    }

    if (currentStage === 'tools') {
      return (
        <div className="action-card workflow-card">
          <div className="section-header">
            <span>Stage 03</span>
            <strong>Required Tools</strong>
          </div>
          <div className="stack-list">
            {session.tools.map((tool) => (
              <div key={tool.id} className={`tool-row ${tool.confirmed ? 'done' : ''}`}>
                <div className="tool-layout">
                  <div className="tool-number">{tool.toolNumber}</div>
                  <div>
                    <div className="tool-type">{tool.type}</div>
                    <div className="tool-meta">Program rev: {tool.programRevision}</div>
                  </div>
                </div>
                <button className="action-btn primary" onClick={() => handleConfirmTool(tool.id)} disabled={tool.confirmed}>
                  {tool.confirmed ? 'Inserted' : 'Insert and Confirm'}
                </button>
              </div>
            ))}
          </div>
          <div className="stage-actions">
            <button className="action-btn secondary" onClick={handleNext} disabled={!nextEnabled}>
              {currentStage === 'readyReview' ? 'Proceed to Operation' : 'Next'}
            </button>
          </div>
        </div>
      );
    }

    if (currentStage === 'workpiece') {
      return (
        <div className="action-card workflow-card">
          <div className="section-header">
            <span>Stage 04</span>
            <strong>Workpiece Setup</strong>
          </div>
          <div className="info-grid">
            <div className="info-box"><label>Fixture</label><p>{session.workOrder.fixture}</p></div>
            <div className="info-box"><label>Material</label><p>{session.workOrder.material}</p></div>
            <div className="info-box"><label>Drawing</label><p>{session.workOrder.drawingRevision}</p></div>
            <div className="info-box"><label>Work Offset</label><p>{session.workOrder.workOffset}</p></div>
            <div className="info-box full"><label>Orientation</label><p>{session.workpiece.orientation}</p></div>
            <div className="info-box full"><label>Clamping</label><p>{session.workpiece.clampingInstruction}</p></div>
          </div>
          <button className="action-btn primary" onClick={handleConfirmWorkpiece} disabled={workpieceComplete}>
            {workpieceComplete ? 'Confirmed' : 'Arrange, Clamp & Confirm'}
          </button>
          <div className="stage-actions">
            <button className="action-btn secondary" onClick={handleNext} disabled={!nextEnabled}>
              {currentStage === 'readyReview' ? 'Proceed to Operation' : 'Next'}
            </button>
          </div>
        </div>
      );
    }

    if (currentStage === 'readyReview') {
      return (
        <div className="action-card workflow-card">
          <div className="section-header">
            <span>Stage 05</span>
            <strong>Ready Review</strong>
          </div>
          <div className="ready-banner">READY</div>
          <div className="summary-list">
            <div className={`summary-row ${machineChecksComplete ? 'done' : ''}`}>
              <span>Machine checks</span>
              <strong>{machineChecksComplete ? '✓' : 'Pending'}</strong>
            </div>
            <div className={`summary-row ${toolsComplete ? 'done' : ''}`}>
              <span>Required tools</span>
              <strong>{toolsComplete ? '✓' : 'Pending'}</strong>
            </div>
            <div className={`summary-row ${workpieceComplete ? 'done' : ''}`}>
              <span>Workpiece setup</span>
              <strong>{workpieceComplete ? '✓' : 'Pending'}</strong>
            </div>
          </div>
          <div className="stage-actions">
            <button className="action-btn secondary" onClick={handleNext} disabled={!nextEnabled}>
              {currentStage === 'readyReview' ? 'Proceed to Operation' : 'Next'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="action-card workflow-card">
        <div className="section-header">
          <span>Stage 06</span>
          <strong>Operation</strong>
        </div>
        <div className="operation-title">{session.workOrder.operation}</div>
        <div className={`status-pill ${machineState.toLowerCase()}`}>{machineState}</div>
        <div className="operation-actions">
          <button className="action-btn success" onClick={handleStartOperation} disabled={operationStatus !== 'READY' || !readyComplete}>
            Start
          </button>
          <button className="action-btn danger" onClick={() => setConfirmAction('STOP')} disabled={operationStatus !== 'RUNNING'}>
            Stop
          </button>
        </div>
      </div>
    );
  };

  const renderSecondaryPanel = () => {
    if (selectedNav === 'Jobs/Programs') {
      return (
        <div className="action-card">
          <div className="section-header"><span>Program</span><strong>{session?.workOrder?.cncProgram?.name || 'O2031_POCKET_DRILL'}</strong></div>
          <div className="data-grid compact">
            <div className="metric-box"><label>Revision</label><strong>{session?.workOrder?.cncProgram?.revision || 'v4.2'}</strong></div>
            <div className="metric-box"><label>Work Order</label><strong>{session?.workOrder?.workOrder || 'WO-2026-0913'}</strong></div>
            <div className="metric-box"><label>Operation</label><strong>{session?.workOrder?.operation || 'Op 20'}</strong></div>
            <div className="metric-box"><label>Qty</label><strong>{session?.workOrder?.quantity || 25}</strong></div>
          </div>
        </div>
      );
    }

    if (selectedNav === 'Machine') {
      return (
        <div className="action-card">
          <div className="section-header"><span>Machine</span><strong>Live Status</strong></div>
          <div className="machine-visual limited">
            <div className={`machine-inner ${machineState === 'RUNNING' ? 'running' : ''}`}>
              <div className="machine-table" />
              <div className="spindle" />
              <div className="tool-arm" />
              <div className="coolant-flow" />
            </div>
          </div>
        </div>
      );
    }

    if (selectedNav === 'Tools') {
      return (
        <div className="action-card">
          <div className="section-header"><span>Tooling</span><strong>Magazine</strong></div>
          <div className="tool-list two-col">
            {session?.tools?.map((tool) => (
              <div key={tool.id} className="tool-mini">
                <span>{tool.toolNumber}</span>
                <small>{tool.type}</small>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (selectedNav === 'Alarms') {
      return (
        <div className="action-card">
          <div className="section-header"><span>Faults</span><strong>Alarm List</strong></div>
          <div className="alarm-list">
            <div className="alarm-item warn"><span>Coolant low</span><strong>Warning</strong></div>
            <div className="alarm-item ok"><span>Tool offset OK</span><strong>Nominal</strong></div>
            <div className="alarm-item alert"><span>Door interlock</span><strong>Clear</strong></div>
          </div>
        </div>
      );
    }

    if (selectedNav === 'Production') {
      return (
        <div className="action-card">
          <div className="section-header"><span>Production</span><strong>Job Progress</strong></div>
          <div className="progress-stack">
            <div className="progress-row"><span>Cycle progress</span><strong>72%</strong></div>
            <div className="bar"><span style={{ width: '72%' }} /></div>
            <div className="progress-row"><span>Part count</span><strong>18 / 25</strong></div>
            <div className="bar"><span style={{ width: '72%' }} /></div>
          </div>
        </div>
      );
    }

    if (selectedNav === 'Maintenance') {
      return (
        <div className="action-card">
          <div className="section-header"><span>Maintenance</span><strong>Service Tasks</strong></div>
          <div className="maintenance-list">
            <div className="maintenance-item"><span>Check spindle bearing temp</span><strong>Due</strong></div>
            <div className="maintenance-item"><span>Lubrication line inspection</span><strong>Today</strong></div>
            <div className="maintenance-item"><span>Coolant concentration</span><strong>OK</strong></div>
          </div>
        </div>
      );
    }

    return (
      <div className="action-card">
        <div className="section-header"><span>System</span><strong>Settings</strong></div>
        <div className="settings-list">
          <div className="setting-row"><span>Auto tool wear compensation</span><strong>ON</strong></div>
          <div className="setting-row"><span>Coolant auto-run</span><strong>ON</strong></div>
          <div className="setting-row"><span>Touchscreen mode</span><strong>Enabled</strong></div>
        </div>
      </div>
    );
  };

  const controlButtons = [
    { label: 'START', type: 'primary', action: 'START' },
    { label: 'PAUSE', type: 'secondary', action: 'PAUSE' },
    { label: 'STOP', type: 'danger', action: 'STOP' },
    { label: 'RESET', type: 'neutral', action: 'RESET' },
  ];

  return (
    <div className="industrial-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">VMC</div>
          <div>
            <div className="brand-title">Operator HMI</div>
            <small>Cell 04 / Vertical Machining</small>
          </div>
        </div>

        <nav className="nav-list">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item}
              className={`nav-item ${selectedNav === item ? 'active' : ''}`}
              onClick={() => setSelectedNav(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="top-status-bar">
          <div className="machine-info">
            <div className="machine-label">Machine ID</div>
            <strong>VMC-204</strong>
          </div>
          <div className="machine-info">
            <div className="machine-label">Connection</div>
            <strong className="status-text online">ONLINE</strong>
          </div>
          <div className="machine-info">
            <div className="machine-label">Machine State</div>
            <strong className={`status-text ${machineState.toLowerCase()}`}>{machineState}</strong>
          </div>
          <div className="machine-info">
            <div className="machine-label">Mode</div>
            <strong>MDA</strong>
          </div>
          <div className="machine-info">
            <div className="machine-label">Operator</div>
            <strong>OP-18</strong>
          </div>
          <div className="machine-info">
            <div className="machine-label">Current Time</div>
            <strong>{formatTime(currentTime)}</strong>
          </div>
          <div className="machine-info emergency">
            <div className="machine-label">Emergency Stop</div>
            <strong className="status-text alarm">ARMED</strong>
          </div>
        </header>

        <div className="job-summary">
          <div>
            <div className="mini-label">Active Job</div>
            <h2>{session?.workOrder?.workOrder || 'WO-2026-0913'}</h2>
          </div>
          <div className="summary-stack">
            <div className="summary-chip">
              <span>Program</span>
              <strong>{session?.workOrder?.cncProgram?.name || 'O2031_POCKET_DRILL'}</strong>
            </div>
            <div className="summary-chip">
              <span>Cycle</span>
              <strong>00:34:18</strong>
            </div>
            <div className="summary-chip">
              <span>Job progress</span>
              <strong>{jobProgress}%</strong>
              <div className="bar small"><span style={{ width: `${jobProgress}%` }} /></div>
            </div>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading-panel">Loading machine status...</div>
        ) : (
          <>
            <div className="main-content-grid">
              <div className="column-main">
                {selectedNav === 'Dashboard' ? renderWorkflowStage() : renderSecondaryPanel()}
              </div>

              <div className="column-side">
                <div className="action-card metrics-card">
                  <div className="section-header"><span>Live Metrics</span><strong>Spindle</strong></div>
                  <div className="metric-grid">
                    <div className="metric-box"><label>Spindle Speed</label><strong>{metrics.spindleSpeed} RPM</strong><small>↗</small></div>
                    <div className="metric-box"><label>Feed Rate</label><strong>{metrics.feedRate} mm/min</strong><small>↗</small></div>
                    <div className="metric-box"><label>Load</label><strong>{metrics.spindleLoad}%</strong><small>↗</small></div>
                    <div className="metric-box"><label>Tool</label><strong>{metrics.tool}</strong><small>OK</small></div>
                    <div className="metric-box"><label>Temp</label><strong>{metrics.temperature}°C</strong><small>↗</small></div>
                    <div className="metric-box"><label>Coolant</label><strong>{metrics.coolant}%</strong><small>↗</small></div>
                    <div className="metric-box full"><label>Vibration</label><strong>{metrics.vibration.toFixed(2)} mm/s</strong><small>Low</small></div>
                  </div>
                </div>

                <div className="action-card machine-card">
                  <div className="section-header"><span>Machine View</span><strong>VMC Enclosure</strong></div>
                  <div className="machine-visual">
                    <div className={`machine-inner ${machineState === 'RUNNING' ? 'running' : ''}`}>
                      <div className="machine-table" />
                      <div className="spindle" />
                      <div className="tool-arm" />
                      <div className="coolant-flow" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {selectedNav === 'Dashboard' && null}
          </>
        )}

        <div className="bottom-control-bar">
          <button
            className={`control-btn primary proceed`}
            onClick={handleNext}
            disabled={!nextEnabled}
          >
            {currentStage === 'readyReview' ? 'Proceed to Operation' : 'Next'}
          </button>

          <div className="control-group">
            {controlButtons.map((button) => (
              <button
                key={button.label}
                className={`control-btn ${button.type}`}
                onClick={() => handleControlAction(button.action)}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>
      </main>

      {confirmAction && (
        <div className="modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="modal-card highlight" onClick={(event) => event.stopPropagation()}>
            <h3>Confirm {confirmAction}</h3>
            <p>Are you sure you want to {confirmAction.toLowerCase()} the current machine cycle?</p>
            <div className="modal-actions">
              <button className="action-btn secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="action-btn danger" onClick={confirmModal}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
