// src/components/credit-test-button.tsx
export default function CreditTestButton() {
  const cost = Number(process.env.PER_USE_CREDIT_COST ?? '1') || 1;
  return (
    <form method="POST" action="/api/test-deduct" className="inline-block">
      <button
        className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:opacity-95"
        title={`Deduct ${cost} credits (no deduction if on an unlimited subscription)`}
      >
        Test: Deduct {cost} credits
      </button>
    </form>
  );
}
