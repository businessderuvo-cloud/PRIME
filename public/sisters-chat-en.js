import {plans} from './pricing.js';
export function createEnglishConversation(){
 let topic='',selected='',name='',joke=0;
 return message=>{
  const q=String(message).toLowerCase().trim();
  const match=/\b(?:my name is|i'm|i am) ([a-z]{2,20})\b/.exec(q);if(match&&!['looking','interested','fine','good'].includes(match[1])){name=match[1][0].toUpperCase()+match[1].slice(1);return `Nice to meet you, ${name} 😊 I'm Veronica. What would you like to know about PRIME?`;}
  if(/prett|beaut|hotter|attract|bella/.test(q)){topic='beauty';return ++joke===1?"I'd say me… but my sister Vanessa might have a different opinion 😉 Luckily, you don't have to choose: we make a good team.":"All right, I'll admit I'm biased! Vanessa has the voice, I've got the charm of a good chat. Let's call it a draw 😉";}
  if(/joke|funny|haha|laugh/.test(q))return "My sister and I get along perfectly — until someone asks which of us has to answer one more ‘Is it still available?’ 😄";
  if(/how are you|how's it going/.test(q))return "Ready to help, so I'd say pretty well 😊 Are you exploring, or looking for something specific for your agency?";
  if(/^(hi|hello|hey|good morning|good evening)[!.\s]*$/.test(q))return `Hi${name?', '+name:''}! I'm Veronica 😊 Want to get to know us, or talk about your agency?`;
  if(/^(thanks|thank you|great|perfect)[!.\s]*$/.test(q))return "You're welcome 😊 What else would you like to know?";
  if(/^(bye|goodbye|see you)[!.\s]*$/.test(q))return "See you soon! My sister Vanessa and I will be here when you need us 😊";
  if(/human|real person|robot|your age/.test(q))return "I'm a virtual assistant, so no birthdays to remember 😉 This is a guided demo about PRIME; I don't have access to your agency's private data.";
  if(/^(yes|sure|okay|ok|go on|tell me)[!.\s]*$/.test(q))return topic==='beauty'?"My sister Vanessa handles advanced AI calls and Detective in VIP and Elite. I help in chat from Pro. Different strengths, the same team.":"Of course 😊 Would you like to compare the plans, explore the features, or hear about my sister Vanessa?";
  if(/import|migrat|other software|other crm/.test(q))return "You can import data from other systems from Pro upwards, including VIP, Elite and Secret. Standard doesn't include data imports.";
  if(/klarna|instalment|installment/.test(q))return "Klarna is an option for all plans when it is available at checkout for your country, amount and billing schedule. Instalments are subject to Klarna's approval. The new Stripe checkout is currently in test mode.";
  if(/stripe|bank|financial|payment/.test(q))return "Elite and Secret include Stripe Connect for agency payments, invoices, Stripe balance reports and payouts to the registered bank account. Financial Connections is limited to eligible US bank accounts. Corporate cards are coming soon.";
  if(/activat|how long|24 hour/.test(q))return "Register, complete the business verification, then select and pay for your plan. VIP, Elite and Secret are activated within 24 working hours after approval and payment; weekends and public holidays are excluded.";
  if(/personality|custom voice|clone|instructions/.test(q))return "My sister Vanessa already has her own personality. You can guide what she says, how she introduces herself and how formally she addresses people. Elite also supports a custom voice, including an authorised voice from the owner or a team member.";
  if(/quota|minute|allowance|consumption/.test(q))return "VIP includes 1 AI agent and 1,238 call minutes, 225 simple operations, 50 medium and 20 complex Detective searches per month. Elite includes 2 AI agents and 3,738 minutes, 675 simple operations, 150 medium and 60 complex searches. Allowances are shared by the agency and reset monthly, including on annual plans. Extra minutes and searches cannot currently be purchased.";
  const plan=/\b(standard|pro|vip|elite|secret)\b/.exec(q)?.[1];if(plan)selected=plan;
  if(/price|cost|pricing|how much|per month|annual|year/.test(q)){
   if(selected==='secret')return "Secret is tailored to franchises and larger organisations. We prepare a quote based on the configuration and volumes you need.";
   if(selected){const p=plans[selected];return `${p.name} costs €${p.monthly.toLocaleString('en-GB')} a month or €${p.annual.toLocaleString('en-GB')} a year. Annual billing gives you 2 months free. An additional free month is available on annual crypto payments. Would you like to know what's included?`;}
   return "Standard is €53/month (€530/year), Pro €105/month (€1,050/year), VIP €522/month (€5,220/year), and Elite €1,045/month (€10,450/year). Secret is quoted individually. Which plan shall we look at?";
  }
  if(selected==='standard')return "Standard includes property and territory records, owners, CRM, matching, deals, viewings, documents, rentals, the internal calendar, WPS, dictation and mobile access. It includes 2 people, including the owner; extras cost €50/person/month. Support is email only. AI assistants, calls and Detective are not included.";
  if(selected==='pro')return "Pro includes everything in Standard, plus my base AI chat assistance, data imports, property portals, APIs, external calendar sync, provider email, accounting and commissions. It includes 10 people; extras cost €25/person/month. Support is email only. Advanced AI calls and Detective belong to higher plans.";
  if(selected==='vip'||selected==='elite')return "VIP and Elite include the Pro features, unlimited human agents, advanced AI, my sister Vanessa's calls, listing management, Detective, summaries and TXT transcripts, plus priority email and WhatsApp support. Elite adds higher allowances and a custom voice. VIP includes 1 AI agent, with extras at €100/month; Elite includes 2, with extras at €50/month.";
  if(selected==='secret')return "Secret is built around your franchise or larger organisation. Integrations, capacity, support and pricing are agreed in your individual quote.";
  if(/choose|best|recommend|aiutami/.test(q))return "Let's start with your work: do you mainly need property records and CRM, integrations and chat assistance, or advanced AI calls and Detective? That points us towards Standard, Pro, or VIP and Elite.";
  if(/sister|vanessa|veronica|who are|difference|tu e/.test(q))return "I'm Veronica, the base chat assistant available from Pro. My sister Vanessa adds the voice and advanced AI capabilities in VIP and Elite, with tailored options for Secret. You can chat with me here or try a demo call with her.";
  return "I'm with you 😊 I can explain PRIME's plans and features, and have a little chat. This is a guided demo, so I won't pretend to know something I don't. Tell me a little more, or ask about my sister Vanessa.";
 };
}
