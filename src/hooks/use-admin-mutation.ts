"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface UseAdminMutationOptions {
  queryKey: string[];
  errorMessage?: string;
}

export function useAdminMutation<TVariables = unknown, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: UseAdminMutationOptions
) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn,
    onMutate: async () => {
      setError(null);
      await queryClient.cancelQueries({ queryKey: options.queryKey });
      const previousData = queryClient.getQueryData(options.queryKey);
      return { previousData };
    },
    onError: (mutationError: Error, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(options.queryKey, context.previousData);
      }
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : options.errorMessage || "เกิดข้อผิดพลาด"
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: options.queryKey });
    },
  });

  return { ...mutation, error, setError };
}