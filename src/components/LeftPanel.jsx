import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

export default function LeftPanel({ tabs, activeTab, onTabChange, isExpanded, onToggleExpand }) {
  const [internalActive, setInternalActive] = useState(tabs[0] ? tabs[0].id : null);
  const active = activeTab !== undefined ? activeTab : internalActive;
  const setActive = (id) => {
    if (onTabChange) onTabChange(id);
    setInternalActive(id);
  };
  const current = tabs.find((t) => t.id === active) || tabs[0];

  return (
    <div className="leftpanel">
      <div className="tabs" role="tablist">
        <div className="tabs__rail">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === active}
              className={`tab ${t.id === active ? "is-on" : ""}`}
              onClick={() => setActive(t.id)}
              title={t.title || t.label}
            >
              {t.icon && <span className="tab__icon">{t.icon}</span>}
              <span className="tab__lbl">{t.label}</span>
            </button>
          ))}
        </div>
        {onToggleExpand && (
          <button
            type="button"
            className="tab-expand-btn"
            onClick={onToggleExpand}
            title={isExpanded ? "Standard Inspector Width / الحجم القياسي" : "Expand Inspector Width / توسيع لوحة الأدوات"}
            aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <div className="tabpanel" role="tabpanel">
        {current ? current.node : null}
      </div>
    </div>
  );
}
