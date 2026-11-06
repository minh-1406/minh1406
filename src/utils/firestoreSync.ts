import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Student, ClassConfig, DayData, ClassOperationLog } from '../types';
import {
  ROSTER_LIST_KEY,
  MASTER_PIN_KEY,
  DEFAULT_MASTER_PIN,
  MAX_LATE_DAYS_KEY,
  DEFAULT_MAX_LATE_DAYS,
  SCHOOL_DISPLAY_NAME_KEY,
  SCHOOL_LOGO_KEY,
  sSet,
  sGet,
  lopSlug,
  getSchoolId,
  getClassLogs,
  setClassLogs,
  localDateKey,
  checkAndApplyDebtExpiration,
} from './storage';

// Dynamic school-isolated collection and document references
function getSchoolCollections(customSchoolId?: string) {
  const schoolId = customSchoolId || getSchoolId();
  return {
    classesCol: collection(db, `school_${schoolId}_classes`),
    rostersCol: collection(db, `school_${schoolId}_rosters`),
    configsCol: collection(db, `school_${schoolId}_configs`),
    daysCol: collection(db, `school_${schoolId}_days`),
    securityRef: doc(db, `school_${schoolId}_security`, 'settings'),
    pinsCol: collection(db, `school_${schoolId}_pins`),
  };
}

/**
 * Fetch all remote data from Firestore for current school and sync to localStorage cache
 */
export async function syncFromFirestore(): Promise<void> {
  try {
    const cols = getSchoolCollections();

    // 1. Fetch Master PIN & System Settings
    const secDoc = await getDoc(cols.securityRef);
    if (secDoc.exists()) {
      const secData = secDoc.data();
      if (secData?.masterPin) {
        sSet(MASTER_PIN_KEY, secData.masterPin);
      }
      if (secData?.schoolDisplayName) {
        sSet(SCHOOL_DISPLAY_NAME_KEY, secData.schoolDisplayName);
      }
      if (secData?.schoolLogo !== undefined) {
        sSet(SCHOOL_LOGO_KEY, secData.schoolLogo || '');
      }
      if (secData?.maxLateDays !== undefined) {
        sSet(MAX_LATE_DAYS_KEY, Number(secData.maxLateDays));
      } else {
        await setDoc(cols.securityRef, { maxLateDays: DEFAULT_MAX_LATE_DAYS }, { merge: true });
        sSet(MAX_LATE_DAYS_KEY, DEFAULT_MAX_LATE_DAYS);
      }
    } else {
      // Ensure Firestore has default master PIN & system settings if not set yet
      await setDoc(cols.securityRef, {
        masterPin: DEFAULT_MASTER_PIN,
        maxLateDays: DEFAULT_MAX_LATE_DAYS,
      }, { merge: true });
      sSet(MASTER_PIN_KEY, DEFAULT_MASTER_PIN);
      sSet(MAX_LATE_DAYS_KEY, DEFAULT_MAX_LATE_DAYS);
    }

    // 2. Fetch class list & class operation logs
    const classesSnap = await getDocs(cols.classesCol);
    const lopList: string[] = [];
    classesSnap.forEach((d) => {
      const data = d.data();
      if (data && data.lop) {
        lopList.push(data.lop);
      }
      if (data && Array.isArray(data.logs)) {
        sSet('classLogs:' + d.id, data.logs);
      }
    });

    if (lopList.length > 0) {
      lopList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      sSet(ROSTER_LIST_KEY, lopList);
    }

    // 3. Fetch rosters & configs & PINs for each class
    for (const lop of lopList) {
      const slug = lopSlug(lop);
      
      // Roster
      const rosterDoc = await getDoc(doc(cols.rostersCol, slug));
      if (rosterDoc.exists() && rosterDoc.data().students) {
        sSet('roster:' + slug, rosterDoc.data().students);
      }

      // Config
      const configDoc = await getDoc(doc(cols.configsCol, slug));
      if (configDoc.exists() && configDoc.data().config) {
        sSet('classConfig:' + slug, configDoc.data().config);
      }

      // Class Pin
      const pinDoc = await getDoc(doc(cols.pinsCol, slug));
      if (pinDoc.exists() && pinDoc.data().pin !== undefined) {
        sSet('classPin:' + slug, pinDoc.data().pin);
      }
    }

    // 4. Fetch day records
    const daysSnap = await getDocs(cols.daysCol);
    daysSnap.forEach((d) => {
      const data = d.data();
      if (data && data.lop && data.date) {
        const slug = lopSlug(data.lop);
        const dayData: DayData = {
          status: data.status || 'open',
          closedAt: data.closedAt || undefined,
          records: data.records || {},
        };
        if (checkAndApplyDebtExpiration(data.lop, data.date, dayData)) {
          syncSaveDayData(data.lop, data.date, dayData);
        } else {
          sSet(`day:${slug}:${data.date}`, dayData);
        }
      }
    });
  } catch (e) {
    console.error('Error syncing from Firestore:', e);
  }
}

/**
 * Save roster to Firestore & localStorage
 */
export async function syncSaveRoster(lop: string, students: Student[]): Promise<void> {
  const clean = lop.trim();
  if (!clean) return;
  const slug = lopSlug(clean);
  sSet('roster:' + slug, students);

  // Ensure lop is in list
  const list = sGet<string[]>(ROSTER_LIST_KEY, []);
  if (!list.includes(clean)) {
    list.push(clean);
    list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    sSet(ROSTER_LIST_KEY, list);
  }

  try {
    const cols = getSchoolCollections();
    // Update class metadata
    await setDoc(doc(cols.classesCol, slug), { lop: clean }, { merge: true });
    // Replace roster document completely so deleted students are purged from Firestore
    await setDoc(doc(cols.rostersCol, slug), { students });
  } catch (e) {
    console.error('Error saving roster to Firestore:', e);
  }
}

/**
 * Save class config to Firestore & localStorage
 */
export async function syncSaveClassConfig(lop: string, cfg: ClassConfig): Promise<void> {
  const clean = lop.trim();
  if (!clean) return;
  const slug = lopSlug(clean);
  sSet('classConfig:' + slug, cfg);

  try {
    const cols = getSchoolCollections();
    await setDoc(doc(cols.configsCol, slug), { config: cfg }, { merge: true });
  } catch (e) {
    console.error('Error saving class config to Firestore:', e);
  }
}

/**
 * Save day data (attendance records & status) to Firestore & localStorage
 */
export async function syncSaveDayData(lop: string, date: string, day: DayData): Promise<void> {
  const clean = lop.trim();
  if (!clean || !date) return;
  const slug = lopSlug(clean);
  const key = `day:${slug}:${date}`;
  sSet(key, day);

  try {
    const cols = getSchoolCollections();
    const docId = `${slug}_${date}`;
    // Replace day data document completely so deleted records/photos are purged from Firestore
    await setDoc(doc(cols.daysCol, docId), {
      lop: clean,
      date,
      status: day.status,
      closedAt: day.closedAt || null,
      records: day.records || {},
    });
  } catch (e) {
    console.error('Error saving day data to Firestore:', e);
  }
}

/**
 * Fetch day data for a class and date from Firestore (with fallback to local)
 */
export async function syncGetDayData(lop: string, date: string): Promise<DayData> {
  const clean = lop.trim();
  const slug = lopSlug(clean);
  const key = `day:${slug}:${date}`;

  try {
    const cols = getSchoolCollections();
    const docId = `${slug}_${date}`;
    const snap = await getDoc(doc(cols.daysCol, docId));
    if (snap.exists()) {
      const data = snap.data();
      const dayData: DayData = {
        status: data.status || 'open',
        closedAt: data.closedAt,
        records: data.records || {},
      };
      if (checkAndApplyDebtExpiration(clean, date, dayData)) {
        await syncSaveDayData(clean, date, dayData);
      } else {
        sSet(key, dayData);
      }
      return dayData;
    }
  } catch (e) {
    console.error('Error fetching day data from Firestore:', e);
  }

  // Fallback to local
  const existing = sGet<DayData | null>(key, null);
  if (existing) return existing;
  const newDay: DayData = { status: 'open', records: {} };
  sSet(key, newDay);
  return newDay;
}

/**
 * Save class PIN
 */
export async function syncSaveClassPin(lop: string, pin: string): Promise<void> {
  const clean = lop.trim();
  const slug = lopSlug(clean);
  sSet('classPin:' + slug, pin.trim());

  try {
    const cols = getSchoolCollections();
    await setDoc(doc(cols.pinsCol, slug), { pin: pin.trim() }, { merge: true });
  } catch (e) {
    console.error('Error saving class pin to Firestore:', e);
  }
}

/**
 * Save master PIN
 */
export async function syncSaveMasterPin(pin: string): Promise<boolean> {
  if (!pin || pin.trim().length < 4) return false;
  const clean = pin.trim();
  sSet(MASTER_PIN_KEY, clean);

  try {
    const cols = getSchoolCollections();
    await setDoc(cols.securityRef, { masterPin: clean }, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving master pin to Firestore:', e);
    return false;
  }
}

/**
 * Save max late days configuration (BGH setting)
 */
export async function syncSaveMaxLateDays(days: number): Promise<boolean> {
  const cleanDays = Math.max(0, Math.floor(days));
  sSet(MAX_LATE_DAYS_KEY, cleanDays);

  try {
    const cols = getSchoolCollections();
    await setDoc(cols.securityRef, { maxLateDays: cleanDays }, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving maxLateDays to Firestore:', e);
    return false;
  }
}

/**
 * Save school display name (BGH setting) to Firestore & localStorage for a given school workspace
 */
export async function syncSaveSchoolDisplayName(name: string, targetSchoolId?: string): Promise<boolean> {
  const clean = (name || '').trim();
  if (!clean) return false;
  const schoolId = targetSchoolId || getSchoolId();

  try {
    localStorage.setItem(`sc_${schoolId}:${SCHOOL_DISPLAY_NAME_KEY}`, JSON.stringify(clean));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app_storage_updated', { detail: { key: SCHOOL_DISPLAY_NAME_KEY } }));
    }
  } catch (e) {
    // ignore
  }

  try {
    const cols = getSchoolCollections(schoolId);
    await setDoc(cols.securityRef, { schoolDisplayName: clean }, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving schoolDisplayName to Firestore:', e);
    return false;
  }
}

/**
 * Save school custom logo (BGH setting) to Firestore & localStorage for a given school workspace
 */
export async function syncSaveSchoolLogo(logoDataUrl: string, targetSchoolId?: string): Promise<boolean> {
  const clean = (logoDataUrl || '').trim();
  const schoolId = targetSchoolId || getSchoolId();

  try {
    localStorage.setItem(`sc_${schoolId}:${SCHOOL_LOGO_KEY}`, JSON.stringify(clean));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app_storage_updated', { detail: { key: SCHOOL_LOGO_KEY } }));
    }
  } catch (e) {
    // ignore
  }

  try {
    const cols = getSchoolCollections(schoolId);
    await setDoc(cols.securityRef, { schoolLogo: clean }, { merge: true });
    return true;
  } catch (e) {
    console.error('Error saving schoolLogo to Firestore:', e);
    return false;
  }
}

/**
 * Append a real-time class operation log (GVCN or Student action) to localStorage and Firestore
 */
export async function syncAppendClassLog(
  lop: string,
  entry: Omit<ClassOperationLog, 'id' | 'lop' | 'timestamp' | 'date'> & {
    timestamp?: number;
    date?: string;
  }
): Promise<void> {
  const clean = (lop || '').trim();
  if (!clean) return;
  const slug = lopSlug(clean);
  const ts = entry.timestamp || Date.now();
  const dateStr = entry.date || localDateKey(new Date(ts));
  const newLog: ClassOperationLog = {
    id: `${slug}-${ts}-${Math.random().toString(36).slice(2, 6)}`,
    lop: clean,
    date: dateStr,
    timestamp: ts,
    actorRole: entry.actorRole,
    actorName: entry.actorName,
    actorId: entry.actorId,
    actionTitle: entry.actionTitle,
    details: entry.details,
    photo: entry.photo || null,
    photoCaptureTime: entry.photoCaptureTime || null,
  };

  const currentLogs = getClassLogs(clean);
  const updatedLogs = [newLog, ...currentLogs].slice(0, 120);
  setClassLogs(clean, updatedLogs);

  try {
    const cols = getSchoolCollections();
    await setDoc(doc(cols.classesCol, slug), { lop: clean, logs: updatedLogs }, { merge: true });
  } catch (e) {
    console.error('Error saving class operation log to Firestore:', e);
  }
}

/**
 * Delete a class across Firestore and localStorage
 */
export async function syncClearClassAttendanceData(lop: string): Promise<void> {
  const clean = lop.trim();
  if (!clean) return;
  const slug = lopSlug(clean);

  // Clear local storage keys
  const prefix = `sc_${getSchoolId()}:`;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        k.startsWith(prefix) &&
        (k.includes(`day:${slug}:`) ||
          k.includes(`deviceUsage:${slug}:`) ||
          k.includes(`classLogs:${slug}`))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    // ignore
  }

  try {
    const cols = getSchoolCollections();
    const daysSnap = await getDocs(cols.daysCol);
    const deletePromises: Promise<void>[] = [];
    daysSnap.forEach((d) => {
      if (d.id === slug || d.id.startsWith(`${slug}_`)) {
        deletePromises.push(deleteDoc(doc(cols.daysCol, d.id)));
      }
    });
    await Promise.all(deletePromises);
  } catch (e) {
    console.error('Error clearing class attendance data from Firestore:', e);
  }
}

export async function syncDeleteLop(lop: string): Promise<void> {
  const clean = lop.trim();
  if (!clean) return;
  const slug = lopSlug(clean);
  const schoolId = getSchoolId();
  const prefix = `sc_${schoolId}:`;

  // Remove local
  const list = sGet<string[]>(ROSTER_LIST_KEY, []);
  const filtered = list.filter((l) => l.toLowerCase() !== clean.toLowerCase());
  sSet(ROSTER_LIST_KEY, filtered);

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        k.startsWith(prefix) &&
        (k.includes(`day:${slug}:`) ||
          k.includes(`deviceUsage:${slug}:`) ||
          k.includes(`classPin:${slug}`) ||
          k.includes(`roster:${slug}`) ||
          k.includes(`classLogs:${slug}`) ||
          k.includes(`classConfig:${slug}`))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    // ignore
  }

  try {
    const cols = getSchoolCollections();
    await deleteDoc(doc(cols.classesCol, slug));
    await deleteDoc(doc(cols.rostersCol, slug));
    await deleteDoc(doc(cols.configsCol, slug));
    await deleteDoc(doc(cols.pinsCol, slug));

    // Delete ALL day documents (records, photos, leave requests) for this class from Firestore
    const daysSnap = await getDocs(cols.daysCol);
    const deletePromises: Promise<void>[] = [];
    daysSnap.forEach((d) => {
      if (d.id === slug || d.id.startsWith(`${slug}_`)) {
        deletePromises.push(deleteDoc(doc(cols.daysCol, d.id)));
      }
    });
    await Promise.all(deletePromises);
  } catch (e) {
    console.error('Error deleting class from Firestore:', e);
  }
}

/**
 * Setup real-time listener for a class day data
 */
export function subscribeDayData(
  lop: string,
  date: string,
  onUpdate: (day: DayData) => void
): () => void {
  const clean = lop.trim();
  if (!clean || !date) return () => {};
  const slug = lopSlug(clean);
  const docId = `${slug}_${date}`;
  const cols = getSchoolCollections();

  const unsub = onSnapshot(doc(cols.daysCol, docId), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      const dayData: DayData = {
        status: data.status || 'open',
        closedAt: data.closedAt,
        records: data.records || {},
      };
      sSet(`day:${slug}:${date}`, dayData);
      onUpdate(dayData);
    }
  }, (err) => {
    console.error('Day data snapshot error:', err);
  });

  return unsub;
}

/**
 * Setup real-time listener for ALL school data (Master PIN, class PINs, classes, rosters, configs, and day attendance)
 * Used across the entire app for instant synchronization across all devices.
 */
export function subscribeAllSchoolData(
  onUpdate: () => void
): () => void {
  const cols = getSchoolCollections();
  const unsubs: (() => void)[] = [];

  // 1. Master PIN & System Settings snapshot listener
  try {
    const unsubSec = onSnapshot(cols.securityRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d?.masterPin) {
          sSet(MASTER_PIN_KEY, d.masterPin);
        }
        if (d?.schoolDisplayName) {
          sSet(SCHOOL_DISPLAY_NAME_KEY, d.schoolDisplayName);
        }
        if (d?.schoolLogo !== undefined) {
          sSet(SCHOOL_LOGO_KEY, d.schoolLogo || '');
        }
        if (d?.maxLateDays !== undefined) {
          sSet(MAX_LATE_DAYS_KEY, Number(d.maxLateDays));
        }
        onUpdate();
      }
    }, (err) => console.error('Security sync error:', err));
    unsubs.push(unsubSec);
  } catch (e) {
    console.error('Error attaching security snapshot listener:', e);
  }

  // 2. Class PINs snapshot listener
  try {
    const unsubPins = onSnapshot(cols.pinsCol, (snap) => {
      snap.forEach((d) => {
        const data = d.data();
        if (data && data.pin !== undefined) {
          sSet('classPin:' + d.id, data.pin);
        }
      });
      onUpdate();
    }, (err) => console.error('Pins sync error:', err));
    unsubs.push(unsubPins);
  } catch (e) {
    console.error('Error attaching pins snapshot listener:', e);
  }

  // 3. Classes list & operation logs snapshot
  try {
    const unsubClasses = onSnapshot(cols.classesCol, (snap) => {
      const lopList: string[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data && data.lop) {
          lopList.push(data.lop);
        }
        if (data && Array.isArray(data.logs)) {
          sSet('classLogs:' + d.id, data.logs);
        }
      });
      lopList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      sSet(ROSTER_LIST_KEY, lopList);
      onUpdate();
    }, (err) => console.error('Classes sync error:', err));
    unsubs.push(unsubClasses);
  } catch (e) {
    console.error('Error attaching classes snapshot listener:', e);
  }

  // 4. Rosters snapshot
  try {
    const unsubRosters = onSnapshot(cols.rostersCol, (snap) => {
      snap.forEach((d) => {
        const data = d.data();
        if (data && data.students) {
          sSet('roster:' + d.id, data.students);
        }
      });
      onUpdate();
    }, (err) => console.error('Rosters sync error:', err));
    unsubs.push(unsubRosters);
  } catch (e) {
    console.error('Error attaching rosters snapshot listener:', e);
  }

  // 5. Configs snapshot
  try {
    const unsubConfigs = onSnapshot(cols.configsCol, (snap) => {
      snap.forEach((d) => {
        const data = d.data();
        if (data && data.config) {
          sSet('classConfig:' + d.id, data.config);
        }
      });
      onUpdate();
    }, (err) => console.error('Configs sync error:', err));
    unsubs.push(unsubConfigs);
  } catch (e) {
    console.error('Error attaching configs snapshot listener:', e);
  }

  // 6. Days snapshot
  try {
    const unsubDays = onSnapshot(cols.daysCol, (snap) => {
      snap.forEach((d) => {
        const data = d.data();
        if (data && data.lop && data.date) {
          const slug = lopSlug(data.lop);
          const dayData: DayData = {
            status: data.status || 'open',
            closedAt: data.closedAt || undefined,
            records: data.records || {},
          };
          sSet(`day:${slug}:${data.date}`, dayData);
        }
      });
      onUpdate();
    }, (err) => console.error('Days sync error:', err));
    unsubs.push(unsubDays);
  } catch (e) {
    console.error('Error attaching days snapshot listener:', e);
  }

  return () => {
    unsubs.forEach((u) => {
      try {
        u();
      } catch (e) {
        // ignore
      }
    });
  };
}
