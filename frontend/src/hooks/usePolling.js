import { useEffect, useRef } from "react";

/**
 * ينفّذ callback بشكل دوري كل intervalMs.
 * يتوقف تلقائياً عندما تكون التبويبة غير ظاهرة (لتوفير الطلبات والبطارية)،
 * ويستأنف فوراً عند العودة إليها.
 *
 * هذا يحل محل التحديث اللحظي عبر WebSocket - بدل ما السيرفر "يدفع" التحديث،
 * المتصفح "يسأل" السيرفر كل بضع ثوانٍ. الفرق العملي بسيط جداً (تأخير 3-5 ثواني)
 * لكنه يعمل بشكل موثوق على أي استضافة، بما فيها التي لا تدعم WebSocket.
 */
export default function usePolling(callback, intervalMs) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        callbackRef.current();
      }
    };

    const intervalId = setInterval(tick, intervalMs);

    // تحديث فوري عند الرجوع للتبويبة بعد أن كانت مخفية
    const onVisibility = () => {
      if (document.visibilityState === "visible") callbackRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
