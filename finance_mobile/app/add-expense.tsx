import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";

import { ScreenHeader } from "../src/ui/components";
import { colors } from "../src/ui/theme";
import { categories as categoriesApi } from "../src/shared/api/categories";
import { expenses as expensesApi } from "../src/shared/api/expenses";
import { receipts as receiptsApi } from "../src/shared/api/receipts";
import { useAppStore } from "../src/shared/store";
import { Numpad } from "../src/ui/Numpad";
import { ReceiptItemsReview } from "../src/ui/ReceiptItemsReview";
import {
  type DraftLine,
  toDraftLines,
  toExpensePayloads,
} from "../src/shared/utils/receiptItems";
import {
  type NumpadKey,
  groupAmountInput,
  parseAmount,
  updateAmountInput,
} from "../src/shared/utils/amountInput";
import { formatDisplayDate, parseISODate, toISODate } from "../src/shared/utils/date";

/* ------------------------------------------------------------------ */
/*  Types & constantes                                                 */
/* ------------------------------------------------------------------ */

interface Category {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
}

type Mode = "scan" | "form" | "items";
const ICON_RULES: readonly { match: RegExp; icon: Category["icon"] }[] = [
  { match: /alimentation|nourriture|courses|supermarch|restaurant|restauration/i, icon: "silverware-fork-knife" },
  { match: /transport|carburant|taxi|uber|bus|train|avion/i, icon: "car" },
  { match: /loisir|divertissement|vacance|abonnement|streaming|jeu/i, icon: "controller" },
  { match: /sant|medical|pharmacie|soin/i, icon: "medical-bag" },
  { match: /maison|logement|loyer|electricite|eau|entretien/i, icon: "home" },
  { match: /v[eê]tement|shopping|habit|chaussure/i, icon: "shopping" },
  { match: /facture|energie|electricit|internet|telephone|abonnement/i, icon: "receipt" },
  { match: /epargne|epargne|invest/i, icon: "piggy-bank-outline" },
];

/** Icône par défaut selon le libellé serveur de la catégorie. */
function iconFor(label: string): Category["icon"] {
  for (const rule of ICON_RULES) {
    if (rule.match.test(label)) return rule.icon;
  }
  return "shape-outline";
}

const MAX_AMOUNT_DIGITS = 7;

const ANALYZE_STEPS = [
  "Lecture du ticket…",
  "Extraction des montants…",
  "Reconnaissance des libellés…",
  "Catégorisation automatique…",
] as const;

const ANALYZE_STEP_DURATION = 1400;
const ANALYZE_PREVIEW_HEIGHT = 190;

/* ------------------------------------------------------------------ */
/*  Utilitaires purs (testables, hors composant)                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/** Charge les catégories actives depuis l'API et les adapte à l'affichage. */
/** Une date lue par OCR n'est retenue que si elle est récente (≤ 35 jours) et pas dans le futur. */
function isPlausibleReceiptDate(iso: string): boolean {
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const ageDays = (now.getTime() - d.getTime()) / 86_400_000;
  return ageDays >= -1 && ageDays <= 35;
}

function useCategories(userId: string | null) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setCategories([]);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const res = await categoriesApi.list(userId, { limit: 100 });
      setCategories(
        res.items
          .filter((c) => c.active !== false)
          .map((c) => ({ key: c.id, label: c.name, icon: iconFor(c.name) })),
      );
    } catch {
      setCategories([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { categories, loading, failed, reload: load };
}

/* ------------------------------------------------------------------ */
/*  Sous-composants                                                    */
/* ------------------------------------------------------------------ */

const CategoryPicker = memo(function CategoryPicker({
  categories,
  selected,
  onSelect,
}: {
  categories: readonly Category[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(
    () => (showAll ? categories : categories.slice(0, 4)),
    [categories, showAll]
  );

  if (categories.length === 0) {
    return (
      <View>
        <Text style={styles.catTitle}>Catégorie</Text>
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          Aucune catégorie disponible côté serveur.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.catTitle}>Catégorie</Text>
      <View style={styles.catGrid}>
        {visible.map((cat) => {
          const active = selected === cat.key;
          return (
            <Pressable
              key={cat.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Catégorie ${cat.label}`}
              onPress={() => onSelect(cat.key)}
              style={({ pressed }) => [
                styles.catBtn,
                active && styles.catBtnActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.catIcon, active && styles.catIconActive]}>
                <MaterialCommunityIcons
                  color={active ? "#FFFFFF" : colors.primary}
                  name={cat.icon}
                  size={22}
                />
              </View>
              <Text
                numberOfLines={2}
                style={[styles.catLabel, styles.catLabelLines, active && styles.catLabelActive]}
              >
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showAll ? "Afficher moins de catégories" : "Afficher plus de catégories"}
          onPress={() => setShowAll((v) => !v)}
          style={({ pressed }) => [styles.catBtn, pressed && styles.pressed]}
        >
          <View style={styles.catIconMore}>
            <MaterialCommunityIcons
              color={colors.textMuted}
              name={showAll ? "chevron-up" : "dots-horizontal"}
              size={22}
            />
          </View>
          <Text style={styles.catLabelMore}>{showAll ? "Moins" : "Plus"}</Text>
        </Pressable>
      </View>
    </>
  );
});

/** Modal caméra plein écran : permission, cadre de scan, capture. */
function ScanModal({
  visible,
  onClose,
  onValidate,
}: {
  visible: boolean;
  onClose: () => void;
  onValidate: (uri: string) => void;
}) {
  const camRef = useRef<CameraView>(null);
  const scanLine = useRef(new Animated.Value(0)).current;
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  const [permission, requestPermission] = useCameraPermissions();

  /* Barre de scan : montée / descente continue */
  useEffect(() => {
    if (!visible || capturedUri) return;
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
  }, [visible, capturedUri, scanLine]);

  /* Réinitialise la capture quand la modal se rouvre */
  useEffect(() => {
    if (visible) setCapturedUri(null);
  }, [visible]);

  const handleClose = useCallback(() => {
    setCapturedUri(null);
    onClose();
  }, [onClose]);

  const capturePhoto = useCallback(async () => {
    const photo = await camRef.current?.takePictureAsync({ quality: 0.8 });
    if (photo) setCapturedUri(photo.uri);
  }, []);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={handleClose}>
      <View style={styles.cameraRoot}>
        {capturedUri ? (
          <>
            <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} />
            <View style={styles.captureActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reprendre la photo"
                onPress={() => setCapturedUri(null)}
                style={styles.captureGhost}
              >
                <Text style={styles.captureGhostText}>Reprendre</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Valider la photo"
                onPress={() => capturedUri && onValidate(capturedUri)}
                style={styles.capturePrimary}
              >
                <MaterialCommunityIcons color="#FFFFFF" name="check" size={22} />
                <Text style={styles.capturePrimaryText}>Valider</Text>
              </Pressable>
            </View>
          </>
        ) : !permission ? (
          <View style={styles.cameraLoading}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : !permission.granted ? (
          <View style={styles.cameraPermBox}>
            <MaterialCommunityIcons color="#FFFFFF" name="camera-off-outline" size={40} />
            <Text style={styles.cameraPermText}>
              Autorisez la caméra pour scanner vos factures.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={requestPermission}
              style={styles.capturePrimary}
            >
              <Text style={styles.capturePrimaryText}>Autoriser</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back">
            <View style={styles.cameraTop}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fermer le scanner"
                hitSlop={8}
                onPress={handleClose}
                style={styles.cameraClose}
              >
                <MaterialCommunityIcons color="#FFFFFF" name="close" size={26} />
              </Pressable>
              <Text style={styles.cameraHint}>Placez le ticket dans le cadre</Text>
              <View style={styles.cameraCloseSpacer} />
            </View>

            <View style={styles.cameraMiddle}>
              <View
                style={styles.scanFrame}
                onLayout={(e) => setFrameHeight(e.nativeEvent.layout.height)}
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Prendre la photo"
                onPress={capturePhoto}
                style={({ pressed }) => [styles.shutter, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.shutterInner} />
              </Pressable>
            </View>
          </CameraView>
        )}
      </View>
    </Modal>
  );
}

/** Overlay d'analyse : aperçu du ticket balayé par un trait lumineux + étapes. */
function AnalyzingOverlay({ step, uri }: { step: number; uri: string | null }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const progress = Math.min(step + 1, ANALYZE_STEPS.length) / ANALYZE_STEPS.length;
  const lastStep = step >= ANALYZE_STEPS.length - 1;

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.analyzeBackdrop}>
        <View style={styles.analyzeCard}>
          <View style={styles.analyzePreview}>
            {uri ? (
              <Image source={{ uri }} style={styles.analyzeImage} resizeMode="cover" />
            ) : (
              <MaterialCommunityIcons
                color={colors.primary}
                name="receipt-text-outline"
                size={56}
              />
            )}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.analyzeSweep,
                {
                  transform: [
                    {
                      translateY: sweep.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, ANALYZE_PREVIEW_HEIGHT - 4],
                      }),
                    },
                  ],
                },
              ]}
            />
            <View pointerEvents="none" style={[styles.analyzeCorner, styles.analyzeCornerTL]} />
            <View pointerEvents="none" style={[styles.analyzeCorner, styles.analyzeCornerTR]} />
            <View pointerEvents="none" style={[styles.analyzeCorner, styles.analyzeCornerBL]} />
            <View pointerEvents="none" style={[styles.analyzeCorner, styles.analyzeCornerBR]} />
          </View>

          <Text style={styles.analyzeTitle}>Analyse du ticket</Text>

          <View style={styles.analyzeSteps}>
            {ANALYZE_STEPS.map((label, i) => {
              const done = i < step;
              const current = i === step;
              return (
                <View key={label} style={styles.analyzeStepRow}>
                  {done ? (
                    <MaterialCommunityIcons
                      color={colors.success}
                      name="check-circle"
                      size={18}
                    />
                  ) : current ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <MaterialCommunityIcons
                      color="#C5CBDC"
                      name="circle-outline"
                      size={18}
                    />
                  )}
                  <Text
                    style={[
                      styles.analyzeStepText,
                      current && styles.analyzeStepCurrent,
                      done && styles.analyzeStepDone,
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.analyzeTrack}>
            <View style={[styles.analyzeFill, { width: `${progress * 100}%` }]} />
          </View>
          {lastStep && (
            <Text style={styles.analyzeHint}>
              Presque terminé, cela peut prendre quelques secondes de plus…
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Écran principal                                                    */
/* ------------------------------------------------------------------ */

export default function AddExpense() {
  const userId = useAppStore((s) => s.userId);
  const currency = useAppStore((s) => s.currency);
  const { categories, loading: categoriesLoading, failed: categoriesFailed } =
    useCategories(userId);
  const params = useLocalSearchParams<{
    id?: string;
    amount?: string;
    categoryId?: string;
    date?: string;
    note?: string;
  }>();
  const editingId = params.id ?? null;
  const isEditing = !!editingId;

  const [mode, setMode] = useState<Mode>(isEditing ? "form" : "scan");

  /* Formulaire */
  const [amount, setAmount] = useState(params.amount ?? "0");
  const [selectedCategory, setSelectedCategory] = useState(
    params.categoryId ?? ""
  );
  const [note, setNote] = useState(params.note ?? "");
  const [date, setDate] = useState(params.date ?? toISODate(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);

  /* Scan */
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptMime, setReceiptMime] = useState("image/jpeg");
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraVisible, setCameraVisible] = useState(false);

  /* Analyse */
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);

  /* Ticket multi-produits */
  const [reviewLines, setReviewLines] = useState<DraftLine[] | null>(null);
  const [scanTotal, setScanTotal] = useState<number | null>(null);
  const [scanMerchant, setScanMerchant] = useState<string | null>(null);

  /* Sauvegarde */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Dérivés                                                          */
  /* ---------------------------------------------------------------- */

  const amountNum = useMemo(() => parseAmount(amount), [amount]);
  const isAmountValid = Number.isFinite(amountNum) && amountNum > 0;
  const canSave = isAmountValid && !saving && !!userId && !!selectedCategory;

  /* Pourquoi « Enregistrer » est grisé (sinon l'échec est silencieux) */
  const blockReason = !userId
    ? "Session non initialisée. Repassez par l'onboarding."
    : categoriesFailed
      ? "Impossible de charger les catégories. Vérifiez le serveur."
      : !categoriesLoading && categories.length === 0
        ? "Aucune catégorie active. Créez-en une avant d'ajouter une dépense."
        : !isAmountValid
          ? "Saisissez un montant valide."
          : !selectedCategory
            ? "Sélectionnez une catégorie."
            : null;

  useEffect(() => {
    if (selectedCategory || categories.length === 0) return;
    setSelectedCategory(categories[0].key);
  }, [categories, selectedCategory]);

  /* ---------------------------------------------------------------- */
  /*  Traitement du ticket : étapes d'UI puis appel API                */
  /* ---------------------------------------------------------------- */

  const applyScan = useCallback(
    async (uri: string) => {
      if (!userId) {
        setAnalyzing(false);
        setScanError("Session non initialisée. Repassez par l'onboarding.");
        return;
      }
      setScanError(null);
      try {
        const scan = await receiptsApi.scan(userId, {
          uri,
          name: `receipt-${Date.now()}.${receiptMime.includes("png") ? "png" : "jpg"}`,
          type: receiptMime,
        });

        if (scan.amount != null) {
          setAmount(
            new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })
              .format(scan.amount)
              .replace(/[  \s]/g, ""),
          );
        }
        const match = scan.category
          ? categories.find(
              (c) => c.label.toLowerCase() === scan.category!.toLowerCase(),
            )
          : undefined;
        if (match) setSelectedCategory(match.key);
        let dateNote: string | null = null;
        if (scan.expense_date) {
          if (isPlausibleReceiptDate(scan.expense_date)) {
            setDate(scan.expense_date);
          } else {
            dateNote = `Date du ticket (${scan.expense_date}) jugée incohérente : date du jour conservée.`;
          }
        }
        const detail = [scan.merchant, scan.description].filter(Boolean).join(" · ");
        if (detail) setNote(detail);
        if (scan.amount == null) {
          setScanError("Ticket lu mais montant illisible. Saisissez-le à la main.");
        } else if (dateNote) {
          setScanError(dateNote);
        }

        const scanItems = scan.items ?? [];
        if (scanItems.length >= 2) {
          setReviewLines(toDraftLines(scanItems, categories, categories[0]?.key ?? ""));
          setScanTotal(scan.amount);
          setScanMerchant(scan.merchant);
          setAnalyzing(false);
          setMode("items");
          return;
        }

        setReviewLines(null);
        setAnalyzing(false);
        setMode("form");
      } catch {
        setAnalyzing(false);
        setScanError(
          "Analyse du ticket impossible. Vérifiez le serveur ou saisissez la dépense à la main.",
        );
      }
    },
    [userId, categories, receiptMime],
  );

  /* Le scan démarre tout de suite ; les étapes ne sont qu'un habillage visuel
     (elles restent sur la dernière tant que le serveur n'a pas répondu). */
  const scanStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!analyzing) {
      scanStartedFor.current = null;
      return;
    }
    setAnalyzeStep(0);
    const timers = ANALYZE_STEPS.slice(1).map((_, i) =>
      setTimeout(() => setAnalyzeStep(i + 1), (i + 1) * ANALYZE_STEP_DURATION),
    );
    return () => timers.forEach(clearTimeout);
  }, [analyzing]);

  useEffect(() => {
    if (!analyzing || !receiptUri) return;
    if (scanStartedFor.current === receiptUri) return;
    scanStartedFor.current = receiptUri;
    void applyScan(receiptUri);
  }, [analyzing, applyScan, receiptUri]);

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  const handleNumpad = useCallback((key: NumpadKey) => {
    setAmount((prev) => updateAmountInput(prev, key, MAX_AMOUNT_DIGITS));
  }, []);

  const pickImageFromGallery = useCallback(async () => {
    setScanError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setScanError("Autorisation galerie refusée.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      mediaTypes: ["images"],
    });
    const asset = res.assets?.[0];
    if (!res.canceled && asset) {
      setReceiptUri(asset.uri);
      setReceiptMime(asset.mimeType || "image/jpeg");
    }
  }, []);

  const startAnalysis = useCallback((uri: string) => {
    setCameraVisible(false);
    setReceiptUri(uri);
    setAnalyzing(true);
  }, []);

  const onDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === "android") setShowDatePicker(false);
      if (event.type === "dismissed" || !selected) return;
      setDate(toISODate(selected));
    },
    []
  );

  const save = useCallback(async () => {
    if (!userId) {
      setSaveError("Session non initialisée. Repassez par l'onboarding.");
      return;
    }
    if (!isAmountValid) {
      setSaveError("Saisissez un montant valide.");
      return;
    }
    if (!selectedCategory) {
      setSaveError("Sélectionnez une catégorie.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        amount: Math.round(amountNum * 100) / 100,
        category_id: selectedCategory,
        expense_date: date,
        note: note.trim() || null,
      };
      if (editingId) {
        await expensesApi.update(userId, editingId, payload);
      } else {
        await expensesApi.create(userId, payload);
      }
      router.back();
    } catch {
      setSaveError(
        "Impossible d'enregistrer la dépense. Vérifiez que le serveur est démarré."
      );
    } finally {
      setSaving(false);
    }
  }, [userId, isAmountValid, selectedCategory, amountNum, date, note, editingId]);

  const saveItems = useCallback(async () => {
    if (!userId || !reviewLines) return;
    const payloads = toExpensePayloads(reviewLines, date);
    if (payloads.length === 0) {
      setSaveError("Ajoutez au moins une ligne valide (montant et catégorie).");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await expensesApi.createMany(userId, payloads);
      router.back();
    } catch {
      setSaveError("Impossible d'enregistrer les dépenses. Aucune n'a été créée, réessayez.");
    } finally {
      setSaving(false);
    }
  }, [userId, reviewLines, date]);

  /* ---------------------------------------------------------------- */
  /*  Rendu                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScreenHeader
        title={isEditing ? "Modifier la dépense" : "Nouvelle dépense"}
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
          {(
            [
              { key: "scan", icon: "camera-outline", label: "Scanner" },
              { key: "form", icon: "keyboard-outline", label: "Formulaire" },
            ] as const
          ).map((m) => {
            const active = mode === m.key;
            return (
              <Pressable
                key={m.key}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Mode ${m.label}`}
                onPress={() => setMode(m.key)}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
              >
                <MaterialCommunityIcons
                  color={active ? "#FFFFFF" : colors.primary}
                  name={m.icon}
                  size={18}
                />
                <Text
                  style={[styles.modeBtnText, active && styles.modeBtnTextActive]}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === "items" && reviewLines ? (
          <ReceiptItemsReview
            lines={reviewLines}
            onChange={setReviewLines}
            categories={categories}
            defaultCategoryKey={categories[0]?.key ?? ""}
            currency={currency}
            scanTotal={scanTotal}
            merchant={scanMerchant}
            saving={saving}
            error={saveError}
            onConfirm={saveItems}
            onUseTotal={() => setMode("form")}
          />
        ) : mode === "scan" ? (
          <View style={styles.scanSection}>
            {receiptUri ? (
              <>
                <Image source={{ uri: receiptUri }} style={styles.receiptPreview} />
                <View style={styles.scanActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Valider le ticket scanné"
                    onPress={() => receiptUri && startAnalysis(receiptUri)}
                    style={({ pressed }) => [styles.scanBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.scanBtnText}>Valider</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reprendre le scan"
                    onPress={() => {
                      setReceiptUri(null);
                      setCameraVisible(true);
                    }}
                    style={({ pressed }) => [
                      styles.scanGhostBtn,
                      pressed && styles.pressed,
                    ]}
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
                  Photographiez votre ticket depuis l'appli ou importez-le depuis la
                  galerie. Les montants seront pré-remplis.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Scanner avec l'appareil photo"
                  onPress={() => setCameraVisible(true)}
                  style={({ pressed }) => [styles.takeBtn, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons name="camera" color="#FFFFFF" size={20} />
                  <Text style={styles.takeBtnText}>Scanner avec l'appareil photo</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choisir une image dans la galerie"
                  onPress={pickImageFromGallery}
                  style={({ pressed }) => [
                    styles.galleryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    color={colors.primary}
                    name="image-outline"
                    size={20}
                  />
                  <Text style={styles.galleryBtnText}>Choisir dans la galerie</Text>
                </Pressable>
              </View>
            )}
            {scanError && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {scanError}
              </Text>
            )}
          </View>
        ) : (
          <>
            {/* ── Montant, juste au-dessus du pavé ── */}
            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>Montant de la dépense</Text>
              <View style={styles.amountRow}>
                <Text
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  style={[styles.amountValue, amount === "0" && styles.amountPlaceholder]}
                >
                  {groupAmountInput(amount)}
                </Text>
                <Text style={styles.amountCurrency}>FCFA</Text>
              </View>
            </View>

            {/* ── Pavé numérique ── */}
            <Numpad onPress={handleNumpad} />

            {/* ── Catégorie ── */}
            <CategoryPicker
              categories={categories}
              selected={selectedCategory}
              onSelect={setSelectedCategory}
            />

            {/* ── Détails : date + note ── */}
            <Text style={styles.catTitle}>Détails</Text>
            <View style={styles.detailsCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Date de la dépense : ${formatDisplayDate(date)}`}
                onPress={() => setShowDatePicker((v) => !v)}
                style={({ pressed }) => [styles.detailRow, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  color={colors.primary}
                  name="calendar-month-outline"
                  size={20}
                />
                <Text style={styles.dateRowLabel}>Date</Text>
                <View style={styles.datePill}>
                  <Text style={styles.datePillText}>{formatDisplayDate(date)}</Text>
                </View>
              </Pressable>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <MaterialCommunityIcons
                  color={colors.primary}
                  name="note-text-outline"
                  size={20}
                />
                <TextInput
                  style={styles.noteInput}
                  placeholder="Ajouter une note (optionnel)"
                  placeholderTextColor={`${colors.textMuted}80`}
                  value={note}
                  onChangeText={setNote}
                  maxLength={200}
                  accessibilityLabel="Note (optionnel)"
                />
              </View>
            </View>
            {showDatePicker && (
              <>
                <DateTimePicker
                  value={parseISODate(date)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onDateChange}
                  maximumDate={new Date()}
                  accentColor={colors.primary}
                  themeVariant="light"
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowDatePicker(false)}
                    style={styles.pickerDone}
                  >
                    <Text style={styles.pickerDoneText}>OK</Text>
                  </Pressable>
                )}
              </>
            )}

            {/* ── Save ── */}
            {!canSave && !saving && blockReason && !saveError && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {blockReason}
              </Text>
            )}
            {saveError && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {saveError}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              accessibilityLabel="Enregistrer la dépense"
              style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
              onPress={save}
              disabled={!canSave}
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
      <ScanModal
        visible={cameraVisible}
        onClose={() => setCameraVisible(false)}
        onValidate={startAnalysis}
      />

      {/* ── Analyse du ticket en cours ── */}
      {analyzing && <AnalyzingOverlay step={analyzeStep} uri={receiptUri} />}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { gap: 16, padding: 16, paddingBottom: 32 },

  pressed: { opacity: 0.75 },

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
    paddingHorizontal: 16,
    paddingVertical: 22,
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
  amountRow: { alignItems: "flex-end", flexDirection: "row", maxWidth: "100%" },
  amountPlaceholder: { color: `${colors.textMuted}66` },
  amountValue: {
    color: colors.text,
    flexShrink: 1,
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
  detailsCard: {
    backgroundColor: "#E5EEFF",
    borderRadius: 14,
    overflow: "hidden",
  },
  detailRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  detailDivider: { backgroundColor: "#D3E4FE", height: 1, marginLeft: 44 },
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
  noteInput: { color: colors.text, flex: 1, fontSize: 15, paddingVertical: 14 },

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
    borderColor: "transparent",
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 10,
    width: "22%",
  },
  catBtnActive: {
    backgroundColor: "#E5EEFF",
    borderColor: colors.primary,
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
  catIconActive: { backgroundColor: colors.primary },
  catLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  catLabelLines: { minHeight: 30 },
  catLabelActive: { color: colors.primary, fontWeight: "700" },
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
  cameraLoading: { alignItems: "center", flex: 1, justifyContent: "center" },
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
  cameraMiddle: { alignItems: "center", flex: 1, justifyContent: "center" },
  scanFrame: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: colors.primary,
    borderRadius: 18,
    height: 320,
    overflow: "hidden",
    position: "relative",
    width: "78%",
  },
  corner: { borderColor: "#FFFFFF", height: 26, position: "absolute", width: 26 },
  cornerTL: { borderLeftWidth: 3, borderTopWidth: 3, left: 10, top: 10 },
  cornerTR: { borderRightWidth: 3, borderTopWidth: 3, right: 10, top: 10 },
  cornerBL: { borderBottomWidth: 3, borderLeftWidth: 3, bottom: 10, left: 10 },
  cornerBR: { borderBottomWidth: 3, borderRightWidth: 3, bottom: 10, right: 10 },
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
  cameraBottom: { alignItems: "center", paddingBottom: 34 },
  shutter: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 99,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  shutterInner: { backgroundColor: "#FFFFFF", borderRadius: 99, height: 58, width: 58 },

  /* Analyse IA */
  analyzeBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(11,28,48,0.6)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  analyzeCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    gap: 14,
    padding: 24,
    width: "100%",
  },
  analyzePreview: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    height: ANALYZE_PREVIEW_HEIGHT,
    justifyContent: "center",
    overflow: "hidden",
    width: 150,
  },
  analyzeImage: { height: "100%", width: "100%" },
  analyzeSweep: {
    backgroundColor: colors.primary,
    height: 3,
    left: 0,
    opacity: 0.85,
    position: "absolute",
    right: 0,
    shadowColor: colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    top: 0,
  },
  analyzeCorner: {
    borderColor: "#FFFFFF",
    height: 18,
    position: "absolute",
    width: 18,
  },
  analyzeCornerTL: { borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 8, left: 8, top: 8 },
  analyzeCornerTR: { borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 8, right: 8, top: 8 },
  analyzeCornerBL: { borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8, bottom: 8, left: 8 },
  analyzeCornerBR: { borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8, bottom: 8, right: 8 },
  analyzeTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  analyzeSteps: { alignSelf: "stretch", gap: 10 },
  analyzeStepRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  analyzeStepText: { color: "#8A8B9E", fontSize: 14, fontWeight: "500" },
  analyzeStepCurrent: { color: colors.text, fontWeight: "700" },
  analyzeStepDone: { color: colors.textMuted },
  analyzeTrack: {
    alignSelf: "stretch",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 99,
    height: 6,
    overflow: "hidden",
  },
  analyzeFill: { backgroundColor: colors.primary, borderRadius: 99, height: 6 },
  analyzeHint: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
});
