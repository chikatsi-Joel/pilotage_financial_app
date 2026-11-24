/**
 * Achat de l'abonnement Premium sur Google Play (Android).
 *
 * L'app ne décide jamais seule : chaque achat est envoyé au serveur, qui le vérifie auprès de
 * Google puis active le Premium. L'achat n'est finalisé (finishTransaction) qu'après cette
 * vérification ; sinon Google le rembourse au bout de 3 jours, et `restore()` le reprend au
 * prochain passage.
 *
 * Produit Play Console : abonnement `lucia_premium`, offres de base `mensuel` et `annuel`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import {
  ErrorCode,
  deepLinkToSubscriptions,
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
} from "expo-iap";

import { billing } from "../api";
import type { BillingStatus } from "../types";

export const PREMIUM_PRODUCT = "lucia_premium";

/** Paiement Google Play utilisable : Android ET module natif présent (absent d'une app compilée
 *  avant l'ajout d'expo-iap, ou d'Expo Go) ; sinon repli sur la demande par e-mail. */
const STORE_AVAILABLE =
  Platform.OS === "android" && requireOptionalNativeModule("ExpoIap") != null;
const PLAN_ORDER = ["mensuel", "annuel"] as const;
const PLAN_LABEL: Record<string, string> = { mensuel: "Mensuel", annuel: "Annuel" };

export interface PremiumPlan {
  basePlanId: string;
  label: string;
  price: string;
  offerToken: string;
}

type Phase = "loading" | "ready" | "unavailable" | "buying" | "verifying";

/** Offres de base du produit, dans l'ordre mensuel puis annuel. Pour chaque offre de base, on
 *  retient l'offre sans promotion (son id est celui de l'offre de base, ou absent). */
function toPlans(products: unknown[]): PremiumPlan[] {
  const plans = new Map<string, PremiumPlan>();
  for (const product of products as { id: string; subscriptionOffers?: unknown[] }[]) {
    if (product.id !== PREMIUM_PRODUCT) continue;
    for (const raw of product.subscriptionOffers ?? []) {
      const offer = raw as {
        id?: string | null;
        basePlanIdAndroid?: string | null;
        offerTokenAndroid?: string | null;
        displayPrice: string;
      };
      const base = offer.basePlanIdAndroid;
      if (!base || !offer.offerTokenAndroid) continue;
      const isBase = !offer.id || offer.id === base;
      if (plans.has(base) && !isBase) continue;
      plans.set(base, {
        basePlanId: base,
        label: PLAN_LABEL[base] ?? base,
        price: offer.displayPrice,
        offerToken: offer.offerTokenAndroid,
      });
    }
  }
  const rank = (id: string) => {
    const i = (PLAN_ORDER as readonly string[]).indexOf(id);
    return i < 0 ? PLAN_ORDER.length : i;
  };
  return [...plans.values()].sort((a, b) => rank(a.basePlanId) - rank(b.basePlanId));
}

/**
 * @param userId compte connecté
 * @param onPremium appelé avec l'état serveur une fois un achat vérifié
 */
export function usePremiumPurchase(
  userId: string | null,
  onPremium: (status: BillingStatus) => void,
) {
  const [phase, setPhase] = useState<Phase>(STORE_AVAILABLE ? "loading" : "unavailable");
  const [plans, setPlans] = useState<PremiumPlan[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const onPremiumRef = useRef(onPremium);
  onPremiumRef.current = onPremium;
  const accountTag = useRef<string | null>(null);
  // Jetons déjà envoyés au serveur pendant cette session : un événement rejoué n'est pas revérifié.
  const handled = useRef(new Set<string>());

  const settle = useCallback(
    async (purchase: Purchase, quiet: boolean) => {
      const token = purchase.purchaseToken;
      if (!userId || !token || purchase.productId !== PREMIUM_PRODUCT) return;
      if (purchase.purchaseState === "pending") {
        if (!quiet) setMessage("Paiement en attente de confirmation par Google Play.");
        return;
      }
      if (purchase.purchaseState !== "purchased" || handled.current.has(token)) return;
      handled.current.add(token);
      setPhase("verifying");
      try {
        const status = await billing.verifyGoogle(userId, token);
        await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
        setStatus(status);
        if (status.premium) {
          setMessage(null);
          onPremiumRef.current(status);
        } else if (!quiet) {
          setMessage("Cet abonnement n'est plus actif.");
        }
      } catch {
        handled.current.delete(token); // nouvel essai possible (réseau, serveur)
        if (!quiet) {
          setMessage("Paiement reçu, mais la vérification a échoué. Réessayez dans un instant.");
        }
      } finally {
        setPhase("ready");
      }
    },
    [userId],
  );

  /** Reprend les achats non finalisés (app fermée pendant la vérification, autre appareil). */
  const restore = useCallback(
    async (quiet = true) => {
      if (!STORE_AVAILABLE) return;
      try {
        const purchases = await getAvailablePurchases();
        for (const p of purchases) await settle(p, quiet);
      } catch {
        // Boutique indisponible : rien à reprendre.
      }
    },
    [settle],
  );

  // État Premium (toutes plateformes) : affiché dans Paramètres.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    billing
      .status(userId)
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        accountTag.current = s.account_tag;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!STORE_AVAILABLE || !userId) return;
    let alive = true;
    const updated = purchaseUpdatedListener((p) => void settle(p, false));
    const failed = purchaseErrorListener((e) => {
      setPhase("ready");
      if (e.code !== ErrorCode.UserCancelled) setMessage("L'achat n'a pas abouti. Réessayez.");
    });
    (async () => {
      try {
        await initConnection();
        const products = await fetchProducts({ skus: [PREMIUM_PRODUCT], type: "subs" });
        if (!alive) return;
        const found = toPlans((products ?? []) as unknown[]);
        setPlans(found);
        setPhase(found.length ? "ready" : "unavailable");
        void restore(true);
      } catch {
        if (alive) setPhase("unavailable");
      }
    })();
    return () => {
      alive = false;
      updated.remove();
      failed.remove();
      void endConnection().catch(() => undefined);
    };
  }, [userId, settle, restore]);

  const buy = useCallback(async (plan: PremiumPlan) => {
    setMessage(null);
    if (!accountTag.current) {
      setMessage("Compte en cours de chargement, réessayez dans un instant.");
      return;
    }
    setPhase("buying");
    try {
      await requestPurchase({
        type: "subs",
        request: {
          google: {
            skus: [PREMIUM_PRODUCT],
            subscriptionOffers: [{ sku: PREMIUM_PRODUCT, offerToken: plan.offerToken }],
            obfuscatedAccountId: accountTag.current,
          },
        },
      });
      // Résultat attendu dans purchaseUpdatedListener / purchaseErrorListener.
    } catch {
      setPhase("ready");
      setMessage("Impossible d'ouvrir Google Play. Réessayez.");
    }
  }, []);

  /** Page de l'abonnement dans Google Play (résiliation, changement de formule). */
  const manage = useCallback(() => {
    if (!STORE_AVAILABLE) return;
    void deepLinkToSubscriptions({
      skuAndroid: PREMIUM_PRODUCT,
      packageNameAndroid: Constants.expoConfig?.android?.package ?? null,
    }).catch(() => setMessage("Impossible d'ouvrir Google Play."));
  }, []);

  return {
    phase,
    plans,
    message,
    status,
    buy,
    manage,
    restore: () => restore(false),
    storeAvailable: STORE_AVAILABLE,
  };
}

export type PremiumPurchase = ReturnType<typeof usePremiumPurchase>;

/** « 23 décembre 2026 » : fin du Premium. */
export function premiumUntilLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
