import { queryChat } from "@/lib/claude";
import { getSupabaseServer } from "@/lib/supabase";
import { QUERY_SYSTEM_PROMPT } from "@/lib/prompts/query";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
  try {
    const { question, history = [] } = (await request.json()) as {
      question: string;
      history: ChatMessage[];
    };

    if (!question) {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    // Step 1: Ask Claude to generate a SQL query
    const messages: ChatMessage[] = [
      ...history,
      { role: "user", content: question },
    ];

    const sqlResponse = await queryChat(QUERY_SYSTEM_PROMPT, messages);

    // Step 2: Extract and execute SQL
    const sqlMatch = sqlResponse.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    let queryResults: unknown[] | null = null;
    let sqlQuery: string | null = null;
    let sqlError: string | null = null;

    if (sqlMatch) {
      sqlQuery = sqlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
      const supabase = getSupabaseServer();

      // Use Supabase's rpc or raw query via the REST API
      // We'll use the postgres connection through supabase-js
      const { data, error } = await supabase.rpc("exec_sql", {
        sql_query: sqlQuery,
      });

      if (error) {
        sqlError = error.message;
      } else {
        queryResults = data;
      }
    }

    // Step 3: Send results back to Claude for interpretation
    let answer: string;

    if (queryResults !== null) {
      const interpretMessages: ChatMessage[] = [
        { role: "user", content: question },
        { role: "assistant", content: sqlResponse },
        {
          role: "user",
          content: `Here are the query results:\n${JSON.stringify(queryResults, null, 2)}\n\nPlease interpret these results and answer my original question in plain language. Do NOT return another JSON query block.`,
        },
      ];
      answer = await queryChat(QUERY_SYSTEM_PROMPT, interpretMessages);
    } else if (sqlError) {
      // Let Claude know the query failed so it can help
      const errorMessages: ChatMessage[] = [
        { role: "user", content: question },
        { role: "assistant", content: sqlResponse },
        {
          role: "user",
          content: `The SQL query failed with error: ${sqlError}\n\nPlease suggest a corrected query or answer based on what you know. Do NOT return another JSON query block — just explain the issue.`,
        },
      ];
      answer = await queryChat(QUERY_SYSTEM_PROMPT, errorMessages);
    } else {
      // No SQL was generated — Claude answered directly
      answer = sqlResponse;
    }

    return Response.json({
      answer,
      sql: sqlQuery,
      results: queryResults,
    });
  } catch (error) {
    console.error("Query error:", error);
    return Response.json({ error: "Query failed" }, { status: 500 });
  }
}
