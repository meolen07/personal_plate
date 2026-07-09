"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FormField, Input } from "@/components/FormField";
import { createClient } from "@/lib/supabase/client";

interface VirtualFridgeProps {
  onUseIngredients?: (ingredients: string[]) => void;
  compact?: boolean;
}

function getFridgeErrorMessage(error: { code?: string; message?: string } | null) {
  if (!error) return "Could not load your virtual fridge.";

  const message = error.message?.toLowerCase() ?? "";
  if (error.code === "42P01" || message.includes("fridge_items")) {
    return "Virtual Fridge is not set up in the database yet. Please run the latest Supabase schema to create the fridge_items table.";
  }

  return "Could not load your virtual fridge.";
}

export function VirtualFridge({
  onUseIngredients,
  compact = false,
}: VirtualFridgeProps) {
  const [fridgeItems, setFridgeItems] = useState<{ id: string; name: string }[]>([]);
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadFridge() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Please sign in to use your virtual fridge.");
        setLoading(false);
        return;
      }

      const { data, error: fridgeError } = await supabase
        .from("fridge_items")
        .select("id, name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fridgeError) {
        setError(getFridgeErrorMessage(fridgeError));
      } else {
        setFridgeItems(data ?? []);
      }

      setLoading(false);
    }

    loadFridge();
  }, []);

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;

    const exists = fridgeItems.some(
      (item) => item.name.toLowerCase() === trimmed.toLowerCase()
    );

    if (exists) {
      setError("That ingredient is already in your virtual fridge.");
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setError("You must be signed in to save to your virtual fridge.");
          return;
        }

        const { data, error: insertError } = await supabase
          .from("fridge_items")
          .insert({
            user_id: user.id,
            name: trimmed,
          })
          .select("id, name")
          .single();

        if (insertError || !data) {
          setError(
            insertError
              ? getFridgeErrorMessage(insertError)
              : "Failed to add ingredient."
          );
          return;
        }

        setFridgeItems((current) => [data, ...current]);
        setNewItem("");
        setSuccess("Ingredient added to your virtual fridge.");
      } catch {
        setError("Failed to add ingredient.");
      } finally {
        setSaving(false);
      }
    })();
  };

  const removeItem = async (itemId: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("fridge_items")
        .delete()
        .eq("id", itemId);

      if (deleteError) {
        setError(getFridgeErrorMessage(deleteError));
        return;
      }

      setFridgeItems((current) => current.filter((item) => item.id !== itemId));
      setSuccess("Ingredient removed from your virtual fridge.");
    } catch {
      setError("Failed to remove ingredient.");
    } finally {
      setSaving(false);
    }
  };

  const ingredientNames = fridgeItems.map((item) => item.name);

  return (
    <Card
      className={compact ? undefined : "mb-8"}
      title="Virtual Fridge"
      subtitle={
        compact
          ? "Use saved ingredients in your next meal suggestion."
          : "Manage ingredients separately from your personalization profile."
      }
    >
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-4">
          {success}
        </Alert>
      )}

      <div className="space-y-4">
        {!compact && (
          <FormField
            label="Add an ingredient"
            id="fridge-item"
            hint="Examples: eggs, spinach, tofu, chicken breast"
          >
            <div className="flex gap-2">
              <Input
                id="fridge-item"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Add one ingredient"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
              />
              <Button
                type="button"
                onClick={addItem}
                disabled={loading || saving || !newItem.trim()}
              >
                Add
              </Button>
            </div>
          </FormField>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-dark-green">
            Current ingredients
          </p>
          {loading ? (
            <p className="text-sm text-neutral/70">Loading your fridge...</p>
          ) : ingredientNames.length === 0 ? (
            <p className="text-sm text-neutral/70">
              Your virtual fridge is empty.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fridgeItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!compact) {
                      void removeItem(item.id);
                    }
                  }}
                  className="rounded-full border border-light-border bg-sand px-3 py-1 text-sm text-dark-green transition hover:bg-sand/80"
                  title={compact ? undefined : "Remove ingredient"}
                >
                  {item.name}
                  {!compact ? " x" : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {onUseIngredients && (
            <Button
              type="button"
              onClick={() => onUseIngredients(ingredientNames)}
              disabled={loading || ingredientNames.length === 0}
            >
              Use Fridge Ingredients
            </Button>
          )}
          {compact ? (
            <Link href="/fridge">
              <Button type="button" variant="secondary">
                Manage Fridge
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
