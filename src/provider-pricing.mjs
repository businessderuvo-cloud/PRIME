// Private policy: three times combined voice and LLM cost beyond included minutes.
const policy=Object.freeze({voiceUsd:0.08,llmUsd:0.03,usdPerEur:1.1193,multiplier:3});
function number(name,fallback){const value=process.env[name];if(!value)return fallback;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw new RangeError('Configurazione di fatturazione non valida');return n;}
export function customerCallRate(){
 const voice=number('PRIME_CALL_PROVIDER_USD_PER_MINUTE',policy.voiceUsd),llm=number('PRIME_LLM_PROVIDER_USD_PER_MINUTE',policy.llmUsd),fx=number('PRIME_USD_PER_EUR',policy.usdPerEur);
 return Math.round((voice+llm)*policy.multiplier/fx*1e5)/1e5;
}
