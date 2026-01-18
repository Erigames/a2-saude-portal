// Este arquivo roda apenas no servidor (Vercel)
export default async function handler(req, res) {
    // Pega a chave que você vai cadastrar no painel da Vercel
    const apiKeyGroq = process.env.GROQ_API_KEY; 

    const { question, context } = req.body;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${apiKeyGroq}` 
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: `Responda com base neste resumo: "${context}"` }, 
                    { role: "user", content: question }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Erro ao consultar a IA" });
    }
}