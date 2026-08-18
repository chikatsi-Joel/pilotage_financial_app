import { Redirect } from "expo-router";
import { useAppStore } from "../src/shared/store";

export default function Index() {
  const userId = useAppStore((s) => s.userId);
  return userId ? <Redirect href="/dashboard" /> : <Redirect href="/onboarding" />;
}
