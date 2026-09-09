import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";

import { ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";
import { categories as categoriesApi } from "../src/shared/api/categories";
import { expenses as expensesApi } from "../src/shared/api/expenses";
import { useAppStore } from "../src/shared/store";

interface Category {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

const CATEGORIES: Category[] = [
  { key: "alimentation", label: "Alimentation", icon: "silverware-fork-knife" },
  { key: "transport", label: "Transport", icon: "car" },
  { key: "loisirs", label: "Loisirs", icon: "controller" },
  { key: "sante", label: "Santé", icon: "medical-bag" },
  { key: "maison", label: "Maison", icon: "home" },
  { key: "shopping", label: "Shopping", icon: "shopping" },
  { key: "factures", label: "Factures", icon: "receipt" },
];

const NUMPAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [",", "0", "del"],
];

const ANALYZE_STEPS = [
  "Lecture du ticket…",
  "Extraction des montants…",
  "Reconnaissance des libellés…",
  "Catégorisation automatique…",
];

const DEMO_SCAN = {
  amount: 85.2,
  category: "Alimentation",
  expense_date: todayISO(),
  merchant: "Monoprix - Courses",
  description: null as string | null,
};

type Mode = "scan" | "form";

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateDisplay(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseISO(iso));
}

const numberToInput = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })
    .format(n)
    .replace(/[\u00a0\u202f\s]/g, "");

export default function AddExpense() {
  const [mode, setMode] = useState<Mode>("scan");

  const [amount, setAmount] = useState("0");
  const [selectedCategory, setSelectedCategory] = useState("alimentation");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [cameraVisible, setCameraVisible] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const camRef = useRef<CameraView>(null);
  const scanLine = useRef(new Animated.Value(0)).current;
  const [cameraPermission, requestCameraPermission] =
    useCameraPermissions();

  /* Barre de scan : montée / descente continue */
  useEffect(() => {
    if (!cameraVisible || capturedUri) return;
    scanLine.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, {
          toValue: 1,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scanLine, {
          toValue: 0,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [cameraVisible, capturedUri, scanLine]);

  /* Faux traitement IA : étapes successives puis pré-remplissage */
  useEffect(() => {
    if (!analyzing) return;
    setAnalyzeStep(0);
    const interval = setInterval(() => {
      setAnalyzeStep((s) => {
        if (s < ANALYZE_STEPS.length - 1) return s + 1;
        clearInterval(interval);
        applyFakeScan();
        return s;
      });
    }, 900);
    return () => clearInterval(interval);
  }, [analyzing]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [catIds, setCatIds] = useState<Record<string, string>>({});

  const userId = useAppStore((s) => s.userId);

  useEffect(() => {
    if (!userId) return;
    categoriesApi
      .list(userId, { limit: 200 })
      .then((res) => {
        const map: Record<string, string> = {};
        for (const c of res.items) map[c.name.toLowerCase()] = c.id;
        setCatIds(map);
      })
      .catch(() => {});
  }, [userId]);

  const visibleCategories = showMore ? CATEGORIES : CATEGORIES.slice(0, 4);

  function handleNumpad(val: string) {
    if (val === "del") {
      setAmount((a) => (a.length > 1 ? a.slice(0, -1) : "0"));
    } else if (val === ",") {
      if (!amount.includes(",")) setAmount((a) => a + ",");
    } else {
      setAmount((a) => (a === "0" ? val : a.length < 9 ? a + val : a));
    }
  }

  async function pickImageFromGallery() {
    setScanError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setScanError("Autorisation galerie refusée.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      mediaTypes: "images",
    });
    if (!res.canceled && res.assets[0]) setReceiptUri(res.assets[0].uri);
  }

  function applyFakeScan() {
    setAmount(numberToInput(DEMO_SCAN.amount));
    const match = CATEGORIES.find(
      (c) => c.label.toLowerCase() === DEMO_SCAN.category.toLowerCase()
    );
    if (match) setSelectedCategory(match.key);
    if (DEMO_SCAN.expense_date) setDate(DEMO_SCAN.expense_date);
    if (DEMO_SCAN.merchant || DEMO_SCAN.description) {
      setNote([DEMO_SCAN.merchant, DEMO_SCAN.description].filter(Boolean).join(" · "));
    }
    setAnalyzing(false);
    setMode("form");
  }

  function startFakeAnalysis() {
    setCameraVisible(false);
    setCapturedUri(null);
    setAnalyzing(true);
  }

  async function capturePhoto() {
    if (!camRef.current) return;
    const photo = await camRef.current.takePictureAsync({ quality: 0.8 });
    setCapturedUri(photo.uri);
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "dismissed" || !selected) return;
    const m = String(selected.getMonth() + 1).padStart(2, "0");
    const day = String(selected.getDate()).padStart(2, "0");
    setDate(`${selected.getFullYear()}-${m}-${day}`);
  }

  async function save() {
    if (!userId) {
      setSaveError("Session non initialisée. Repassez par l'onboarding.");
      return;
    }
    const amountNum = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setSaveError("Saisissez un montant valide.");
      return;
    }
    const catLabel =
      CATEGORIES.find((c) => c.key === selectedCategory)?.label ?? "";
    const catId = catIds[catLabel.toLowerCase()];
    if (!catId) {
      setSaveError(
        "Catégorie introuvable côté serveur. Vérifiez le serveur puis relancez."
      );
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await expensesApi.create(userId, {
        amount: Math.round(amountNum * 100) / 100,
        category_id: catId,
        expense_date: date,
        note: note.trim() || null,
      });
      router.back();
    } catch {
      setSaveError(
        "Impossible d'enregistrer la dépense. Vérifiez que le serveur est démarré."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader
        title="Nouvelle dépense"
        right={
          <View style={styles.headerAvatar}>
            <MaterialCommunityIcons color="#FFFFFF" name="account" size={18} />
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Mode selector ── */}
        <View style={styles.modeSwitch}>
          <Pressable
            style={[styles.modeBtn, mode === "scan" && styles.modeBtnActive]}
            onPress={() => setMode("scan")}
          >
            <MaterialCommunityIcons
              color={mode === "scan" ? "#FFFFFF" : colors.primary}
              name="camera-outline"
              size={18}
            />
            <Text
              style={[
                styles.modeBtnText,
                mode === "scan" && styles.modeBtnTextActive,
              ]}
            >
              Scanner
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === "form" && styles.modeBtnActive]}
            onPress={() => setMode("form")}
          >
            <MaterialCommunityIcons
              color={mode === "form" ? "#FFFFFF" : colors.primary}
              name="keyboard-outline"
              size={18}
            />
            <Text
              style={[
                styles.modeBtnText,
                mode === "form" && styles.modeBtnTextActive,
              ]}
            >
              Formulaire
            </Text>
          </Pressable>
        </View>

        {mode === "scan" ? (
          <View style={styles.scanSection}>
            {receiptUri ? (
              <>
                <Image source={{ uri: receiptUri }} style={styles.receiptPreview} />
                <View style={styles.scanActionsRow}>
                  <Pressable
                    style={styles.scanBtn}
                    onPress={startFakeAnalysis}
                  >
                    <Text style={styles.scanBtnText}>Valider</Text>
                  </Pressable>
                  <Pressable
                    style={styles.scanGhostBtn}
                    onPress={() => {
                      setReceiptUri(null);
                      setCameraVisible(true);
                    }}
                  >
                    <Text style={styles.scanGhostText}>Reprendre</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.scanCard}>
                <MaterialCommunityIcons
                  color={colors.primary}
                  name="file-document-outline"
                  size={44}
                />
                <Text style={styles.scanTitle}>Scannez votre facture</Text>
                <Text style={styles.scanSubtitle}>
                  Photographiez votre ticket depuis l'appli ou importez-le
                  depuis la galerie. Les montants seront pré-remplis.
                </Text>
                <Pressable
                  style={styles.takeBtn}
                  onPress={() => setCameraVisible(true)}
                >
                  <MaterialCommunityIcons name="camera" color="#FFFFFF" size={20} />
                  <Text style={styles.takeBtnText}>Scanner avec l'appareil photo</Text>
                </Pressable>
                <Pressable
                  style={styles.galleryBtn}
                  onPress={pickImageFromGallery}
                >
                  <MaterialCommunityIcons
                    color={colors.primary}
                    name="image-outline"
                    size={20}
                  />
                  <Text style={styles.galleryBtnText}>
                    Choisir dans la galerie
                  </Text>
                </Pressable>
              </View>
            )}
            {scanError && <Text style={styles.errorText}>{scanError}</Text>}
          </View>
        ) : (
          <>
            {/* ── Amount display card ── */}
            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>Montant de la dépense</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amountValue}>{amount}</Text>
                <Text style={styles.amountCurrency}>€</Text>
              </View>
            </View>

            {/* ── Date ── */}
            <View style={styles.dateRow}>
              <MaterialCommunityIcons
                color={colors.primary}
                name="calendar-month-outline"
                size={20}
              />
              <Text style={styles.dateRowLabel}>Date de la dépense</Text>
              <Pressable
                style={styles.datePill}
                onPress={() => setShowDatePicker((v) => !v)}
              >
                <Text style={styles.datePillText}>{formatDateDisplay(date)}</Text>
              </Pressable>
            </View>
            {showDatePicker && (
              <DateTimePicker
                value={parseISO(date)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
                maximumDate={new Date()}
                accentColor={colors.primary}
                themeVariant="light"
              />
            )}
            {Platform.OS === "ios" && showDatePicker && (
              <Pressable
                onPress={() => setShowDatePicker(false)}
                style={styles.pickerDone}
              >
                <Text style={styles.pickerDoneText}>OK</Text>
              </Pressable>
            )}

            {/* ── Note ── */}
            <View style={styles.noteRow}>
              <MaterialCommunityIcons
                color={colors.textMuted}
                name="note-text"
                size={20}
              />
              <TextInput
                style={styles.noteInput}
                placeholder="Ajouter une note (optionnel)"
                placeholderTextColor={`${colors.textMuted}80`}
                value={note}
                onChangeText={setNote}
              />
            </View>

            {/* ── Categories ── */}
            <Text style={styles.catTitle}>Catégorie</Text>
            <View style={styles.catGrid}>
              {visibleCategories.map((cat) => {
                const active = selectedCategory === cat.key;
                return (
                  <Pressable
                    key={cat.key}
                    style={[styles.catBtn, active && styles.catBtnActive]}
                    onPress={() => setSelectedCategory(cat.key)}
                  >
                    <View style={[styles.catIcon, active && styles.catIconActive]}>
                      <MaterialCommunityIcons
                        color={active ? "#FFFFFF" : colors.primary}
                        name={cat.icon}
                        size={22}
                      />
                    </View>
                    <Text
                      style={[styles.catLabel, active && styles.catLabelActive]}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={styles.catBtn}
                onPress={() => setShowMore((v) => !v)}
              >
                <View style={styles.catIconMore}>
                  <MaterialCommunityIcons
                    color={colors.textMuted}
                    name={showMore ? "chevron-up" : "dots-horizontal"}
                    size={22}
                  />
                </View>
                <Text style={styles.catLabelMore}>
                  {showMore ? "Moins" : "Plus"}
                </Text>
              </Pressable>
            </View>

            {/* ── Numpad ── */}
            <View style={styles.numpad}>
              {NUMPAD.map((row, ri) =>
                row.map((val) => (
                  <Pressable
                    key={`${ri}-${val}`}
                    style={[
                      styles.numpadBtn,
                      val === "del" && styles.numpadBtnDel,
                    ]}
                    onPress={() => handleNumpad(val)}
                  >
                    {val === "del" ? (
                      <MaterialCommunityIcons
                        color={colors.textMuted}
                        name="backspace"
                        size={22}
                      />
                    ) : (
                      <Text style={styles.numpadText}>{val}</Text>
                    )}
                  </Pressable>
                ))
              )}
            </View>

            {/* ── Save ── */}
            {saveError && <Text style={styles.errorText}>{saveError}</Text>}
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.saveText}>Enregistrer</Text>
                  <MaterialCommunityIcons
                    color="#FFFFFF"
                    name="check-circle"
                    size={22}
                  />
                </>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* ── Scanner plein écran ── */}
      <Modal
        visible={cameraVisible}
        animationType="fade"
        onRequestClose={() => {
          setCameraVisible(false);
          setCapturedUri(null);
        }}
      >
        <View style={styles.cameraRoot}>
          {capturedUri ? (
            <>
              <Image
                source={{ uri: capturedUri }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.captureActions}>
                <Pressable
                  style={styles.captureGhost}
                  onPress={() => setCapturedUri(null)}
                >
                  <Text style={styles.captureGhostText}>Reprendre</Text>
                </Pressable>
                <Pressable style={styles.capturePrimary} onPress={startFakeAnalysis}>
                  <MaterialCommunityIcons
                    color="#FFFFFF"
                    name="check"
                    size={22}
                  />
                  <Text style={styles.capturePrimaryText}>Valider</Text>
                </Pressable>
              </View>
            </>
          ) : !cameraPermission ? (
            <View style={styles.cameraLoading}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : !cameraPermission.granted ? (
            <View style={styles.cameraPermBox}>
              <MaterialCommunityIcons
                color="#FFFFFF"
                name="camera-off-outline"
                size={40}
              />
              <Text style={styles.cameraPermText}>
                Autorisez la caméra pour scanner vos factures.
              </Text>
              <Pressable
                style={styles.capturePrimary}
                onPress={requestCameraPermission}
              >
                <Text style={styles.capturePrimaryText}>Autoriser</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              ref={camRef}
              style={StyleSheet.absoluteFill}
              facing="back"
            >
              <View style={styles.cameraTop}>
                <Pressable
                  style={styles.cameraClose}
                  hitSlop={8}
                  onPress={() => setCameraVisible(false)}
                >
                  <MaterialCommunityIcons color="#FFFFFF" name="close" size={26} />
                </Pressable>
                <Text style={styles.cameraHint}>Placez le ticket dans le cadre</Text>
                <View style={styles.cameraCloseSpacer} />
              </View>

              <View style={styles.cameraMiddle}>
                <View
                  style={styles.scanFrame}
                  onLayout={(e) =>
                    setFrameHeight(e.nativeEvent.layout.height)
                  }
                >
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  <Animated.View
                    style={[
                      styles.scanBar,
                      {
                        transform: [
                          {
                            translateY: scanLine.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, Math.max(frameHeight - 28, 0)],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.cameraBottom}>
                <Pressable style={styles.shutter} onPress={capturePhoto}>
                  <View style={styles.shutterInner} />
                </Pressable>
              </View>
            </CameraView>
          )}
        </View>
      </Modal>

      {/* ── Analyse IA en cours (semblant) ── */}
      <Modal visible={analyzing} animationType="fade" transparent>
        <View style={styles.analyzeBackdrop}>
          <View style={styles.analyzeCard}>
            <View style={styles.analyzeIconWrap}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
            <Text style={styles.analyzeTitle}>Analyse en cours</Text>
            <Text style={styles.analyzeStep}>{ANALYZE_STEPS[analyzeStep]}</Text>
            <View style={styles.analyzeDots}>
              {ANALYZE_STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.analyzeDot,
                    i <= analyzeStep && styles.analyzeDotDone,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 16, padding: 16, paddingBottom: 32 },

  headerAvatar: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },

  /* Mode selector */
  modeSwitch: {
    backgroundColor: "#E5EEFF",
    borderRadius: 14,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  modeBtn: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingVertical: 10,
  },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  modeBtnTextActive: { color: "#FFFFFF" },

  /* Scan */
  scanSection: { gap: 14 },
  scanCard: {
    alignItems: "center",
    backgroundColor: "#EFF4FF",
    borderColor: "#D3E4FE",
    borderRadius: 16,
    borderStyle: "dashed",
    borderWidth: 1.5,
    gap: 8,
    padding: 24,
  },
  scanTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  scanSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  takeBtn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 14,
    width: "100%",
  },
  takeBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  galleryBtn: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderColor: `${colors.primary}33`,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 12,
    width: "100%",
  },
  galleryBtnText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  receiptPreview: {
    backgroundColor: "#EFF4FF",
    borderRadius: 16,
    height: 220,
    resizeMode: "cover",
    width: "100%",
  },
  scanActionsRow: { flexDirection: "row", gap: 10 },
  scanBtn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 14,
  },
  scanBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  scanGhostBtn: {
    alignItems: "center",
    backgroundColor: "#E5EEFF",
    borderRadius: 12,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  scanGhostText: { color: colors.primary, fontSize: 14, fontWeight: "700" },

  /* Amount card */
  amountCard: {
    alignItems: "center",
    backgroundColor: "#EFF4FF",
    borderRadius: 16,
    elevation: 2,
    justifyContent: "center",
    paddingVertical: 36,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  amountLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  amountRow: { alignItems: "flex-end", flexDirection: "row" },
  amountValue: {
    color: colors.text,
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -2,
  },
  amountCurrency: {
    color: colors.textMuted,
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 2,
    marginLeft: 4,
  },

  /* Date */
  dateRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  dateRowLabel: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  datePill: {
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  datePillText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  pickerDone: { alignSelf: "flex-end", paddingVertical: 4 },
  pickerDoneText: { color: colors.primary, fontSize: 16, fontWeight: "600" },

  /* Note */
  noteRow: {
    alignItems: "center",
    backgroundColor: "#E5EEFF",
    borderRadius: 12,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  noteInput: { color: colors.text, flex: 1, fontSize: 16 },

  /* Categories */
  catTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catBtn: {
    alignItems: "center",
    backgroundColor: "#E5EEFF",
    borderRadius: 12,
    gap: 6,
    padding: 12,
    width: "22%",
  },
  catBtnActive: {
    backgroundColor: "#E5EEFF",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  catIcon: {
    alignItems: "center",
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 99,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  catIconActive: {
    backgroundColor: colors.primary,
  },
  catLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  catLabelActive: {
    color: colors.primary,
    fontWeight: "700",
  },
  catIconMore: {
    alignItems: "center",
    backgroundColor: "#D3E4FE",
    borderRadius: 99,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  catLabelMore: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  /* Numpad */
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  numpadBtn: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    elevation: 1,
    height: 56,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    width: "30.33%",
  },
  numpadBtnDel: {
    backgroundColor: "#E5EEFF",
    elevation: 0,
    shadowOpacity: 0,
  },
  numpadText: { color: colors.text, fontSize: 24, fontWeight: "600" },

  /* Error */
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "600" },

  /* Save */
  saveBtn: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 12,
    elevation: 4,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  saveText: { color: "#FFFFFF", fontSize: 20, fontWeight: "600" },

  /* Scanner */
  cameraRoot: { backgroundColor: "#000000", flex: 1 },
  cameraLoading: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  cameraPermBox: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    padding: 32,
  },
  cameraPermText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  captureGhost: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 16,
  },
  captureGhostText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  capturePrimary: {
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 16,
  },
  capturePrimaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  captureActions: {
    bottom: 48,
    flexDirection: "row",
    gap: 14,
    left: 24,
    position: "absolute",
    right: 24,
  },
  cameraTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  cameraClose: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 99,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  cameraCloseSpacer: { width: 40 },
  cameraHint: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  cameraMiddle: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  scanFrame: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: colors.primary,
    borderRadius: 18,
    height: 320,
    overflow: "hidden",
    position: "relative",
    width: "78%",
  },
  corner: {
    borderColor: "#FFFFFF",
    height: 26,
    position: "absolute",
    width: 26,
  },
  cornerTL: { borderLeftWidth: 3, borderTopWidth: 3, left: 10, top: 10 },
  cornerTR: { borderRightWidth: 3, borderTopWidth: 3, right: 10, top: 10 },
  cornerBL: { borderBottomWidth: 3, borderLeftWidth: 3, bottom: 10, left: 10 },
  cornerBR: {
    borderBottomWidth: 3,
    borderRightWidth: 3,
    bottom: 10,
    right: 10,
  },
  scanBar: {
    backgroundColor: "rgba(74,124,255,0.25)",
    borderTopColor: colors.primary,
    borderTopWidth: 2,
    height: 28,
    left: 10,
    position: "absolute",
    right: 10,
    top: 6,
  },
  cameraBottom: {
    alignItems: "center",
    paddingBottom: 34,
  },
  shutter: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 99,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  shutterInner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 99,
    height: 58,
    width: 58,
  },

  /* Analyse IA */
  analyzeBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(11,28,48,0.55)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  analyzeCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    gap: 6,
    padding: 28,
    width: "100%",
  },
  analyzeIconWrap: { height: 64, justifyContent: "center", marginBottom: 6 },
  analyzeTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  analyzeStep: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    marginTop: 2,
  },
  analyzeDots: { flexDirection: "row", gap: 6, marginTop: 14 },
  analyzeDot: {
    backgroundColor: "#D3D9E8",
    borderRadius: 99,
    height: 6,
    width: 6,
  },
  analyzeDotDone: {
    backgroundColor: colors.primary,
    width: 18,
  },
});