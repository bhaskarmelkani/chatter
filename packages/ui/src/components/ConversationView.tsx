import { useState } from "react";
import { ChevronDownIcon, WrenchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Message, ToolCall } from "../types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <WrenchIcon className="size-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{tool.name}</span>
          </div>
          <p className="text-xs text-muted-foreground">{tool.durationMs}ms</p>
        </div>
        <ChevronDownIcon
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="grid gap-4 border-t px-4 py-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="subtle-label">Input</p>
            <pre className="overflow-auto rounded-lg border bg-background p-3 text-xs leading-6 text-foreground whitespace-pre-wrap break-all">
              {tool.input}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="subtle-label">Output</p>
            <pre className="overflow-auto rounded-lg border bg-background p-3 text-xs leading-6 text-foreground whitespace-pre-wrap break-all">
              {tool.output ?? "No tool output was captured."}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-full border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "tool") {
    return (
      <div className="rounded-xl border bg-muted/30 px-4 py-3 font-mono text-xs leading-6 text-foreground whitespace-pre-wrap break-all">
        {message.content}
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-3xl space-y-3">
        <div
          className={`rounded-xl border px-4 py-4 ${isUser ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <Badge variant={isUser ? "secondary" : "outline"}>
              {isUser ? "User prompt" : "Agent response"}
            </Badge>
            <span
              className={`text-xs ${isUser ? "text-primary-foreground/80" : "text-muted-foreground"}`}
            >
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-7">
            {message.content}
          </div>
        </div>
        {message.toolCalls?.map((tool) => (
          <ToolCallCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}

interface Props {
  messages: Message[];
}

export default function ConversationView({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
        No conversation messages were captured for this session.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
