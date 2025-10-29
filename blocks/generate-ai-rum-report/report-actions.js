/**
 * Report Actions Module - Handles report saving functionality
 */
import { uploadToDA, getCurrentAnalyzedUrl, fetchReportsFromDA } from './da-upload.js';
import { updateButtonState } from './modal-ui.js';
import { closeReportModal } from './generate-ai-rum-report.js';

const CONFIG = {
  VIEWED_KEY: 'optel-detective-viewed-reports',
  ERROR_TIMEOUT: 2000,
  STYLES: {
    HEADER: 'font-weight: 600; color: #333; padding-top: 12px; margin-top: 12px; border-top: 2px solid #ccc; cursor: default; pointer-events: none;',
    ENTRY_UNVIEWED: 'color: #0066cc; padding-left: 2rem; cursor: pointer; font-size: 14px; line-height: 1.4; font-weight: 600;',
    ENTRY_VIEWED: 'color: #9370db; padding-left: 2rem; cursor: pointer; font-size: 14px; line-height: 1.4; font-weight: normal;',
    BADGE: 'position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; background: #ff4444; border-radius: 50%; z-index: 1000; pointer-events: none;',
  },
};

export function setupReportActions(reportContent) {
  document.getElementById('save-to-da-btn')?.addEventListener('click', (e) => 
    handleSaveToDA(e.target, reportContent)
  );
}

async function handleSaveToDA(button, reportContent) {
  updateButtonState(button, true, '💾 Saving...');
  try {
    const currentUrl = getCurrentAnalyzedUrl();
    await uploadToDA(reportContent, { url: currentUrl, debug: true });
    
    updateButtonState(button, true, '✅ Report Saved');
    
    // Refresh the reports list from DA after successful save
    await initializeSavedReports();
    await updateNotificationBadge();
    
    setTimeout(() => closeReportModal(), 800);
  } catch (error) {
    console.error('[OpTel Detective Report] Error saving report:', error);
    updateButtonState(button, true, '❌ Error Saving Report');
    setTimeout(() => updateButtonState(button, false, '💾 Save Report'), CONFIG.ERROR_TIMEOUT);
  }
}

export async function getSavedReports() {
  try {
    return await fetchReportsFromDA();
  } catch (error) {
    console.error('[OpTel Detective Report] Error fetching saved reports:', error);
    return [];
  }
}

function getViewedReports() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG.VIEWED_KEY) || '[]');
  } catch {
    return [];
  }
}

function getWeekIdentifier(timestamp) {
  const date = new Date(timestamp);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((date - yearStart) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${weekNumber}`;
}

function filterReportsByWeek(reports) {
  const weekMap = new Map();
  
  reports.forEach(report => {
    const week = getWeekIdentifier(report.timestamp);
    if (!weekMap.has(week) || report.timestamp > weekMap.get(week).timestamp) {
      weekMap.set(week, report);
    }
  });
  
  return Array.from(weekMap.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function markReportAsViewed(path) {
  try {
    const viewed = getViewedReports();
    if (!viewed.includes(path)) {
      viewed.push(path);
      localStorage.setItem(CONFIG.VIEWED_KEY, JSON.stringify(viewed));
    }
  } catch (error) {
    console.error('[OpTel Detective Report] Error marking viewed:', error);
  }
}

async function hasUnviewedReports() {
  const allReports = await getSavedReports();
  const filteredReports = filterReportsByWeek(allReports);
  return filteredReports.some(r => !getViewedReports().includes(r.path));
}

async function updateNotificationBadge() {
  const picker = document.querySelector('daterange-picker');
  if (!picker?.shadowRoot) return;
  
  // Remove existing badges
  picker.shadowRoot.querySelector('.report-notification-badge')?.remove();
  picker.querySelector('.report-notification-badge')?.remove();
  
  if (!await hasUnviewedReports()) return;
  
  const wrapper = picker.shadowRoot.querySelector('.daterange-wrapper');
  if (!wrapper) return;
  
  const allReports = await getSavedReports();
  const filteredReports = filterReportsByWeek(allReports);
  const unviewedCount = filteredReports.filter(r => 
    !getViewedReports().includes(r.path)
  ).length;
  
  const badge = Object.assign(document.createElement('div'), {
    className: 'report-notification-badge',
    title: `${unviewedCount} new report${unviewedCount > 1 ? 's' : ''}`,
  });
  badge.style.cssText = CONFIG.STYLES.BADGE;
  
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.appendChild(badge);
}

function addReportToDateRangePicker(result) {
  const dropdown = document.querySelector('daterange-picker')?.shadowRoot?.querySelector('ul.menu');
  if (!dropdown) return;

  let header = dropdown.querySelector('li.saved-reports-header');
  if (!header) {
    header = Object.assign(document.createElement('li'), {
      className: 'saved-reports-header',
      textContent: 'Saved Reports',
    });
    header.style.cssText = CONFIG.STYLES.HEADER;
    dropdown.appendChild(header);
  }

  const isViewed = getViewedReports().includes(result.path);
  const entry = Object.assign(document.createElement('li'), {
    className: 'saved-report-entry',
    textContent: result.filename,
  });
  entry.dataset.reportPath = result.path;
  entry.style.cssText = isViewed ? CONFIG.STYLES.ENTRY_VIEWED : CONFIG.STYLES.ENTRY_UNVIEWED;
  entry.onclick = async () => {
    markReportAsViewed(result.path);
    entry.style.cssText = CONFIG.STYLES.ENTRY_VIEWED;
    await updateNotificationBadge();
    window.open(result.path, '_blank');
  };
  
  // Find the last saved report entry or insert right after header
  const lastEntry = Array.from(dropdown.querySelectorAll('li.saved-report-entry')).pop();
  if (lastEntry) {
    lastEntry.after(entry);
  } else {
    header.after(entry);
  }
}

export async function initializeSavedReports() {
  try {
    // Clear existing report entries
    const dropdown = document.querySelector('daterange-picker')?.shadowRoot?.querySelector('ul.menu');
    if (dropdown) {
      dropdown.querySelectorAll('li.saved-report-entry, li.saved-reports-header').forEach(el => el.remove());
    }
    
    const allReports = await getSavedReports();
    const filteredReports = filterReportsByWeek(allReports);
    filteredReports.forEach(addReportToDateRangePicker);
    setTimeout(async () => await updateNotificationBadge(), 300);
  } catch (error) {
    console.error('[OpTel Detective Report] Error initializing saved reports:', error);
  }
}

