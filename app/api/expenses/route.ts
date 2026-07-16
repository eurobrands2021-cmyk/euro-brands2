import { Prisma, type Branch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, handleServerError, CACHE_NONE } from "@/lib/api";
import { parseExpenseInput, ValidationError } from "@/lib/validate";
import { round2 } from "@/lib/sale-utils";
import { toExpenseDTO } from "@/lib/serializers";
import { MOCK_MODE, mockListExpenses, mockCreateExpense } from "@/lib/mock-store";
import {
  BRANCHES,
  EXPENSE_CATEGORIES,
  type BranchValue,
  type ExpenseCategoryValue,
} from "@/lib/constants";
import type { ExpenseDTO, ExpensesListResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/expenses — قائمة المصروفات (فلاتر: branch / category / from / to)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (MOCK_MODE) return ok(mockListExpenses(searchParams), 200, CACHE_NONE);

    const branch = searchParams.get("branch");
    const category = searchParams.get("category");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Prisma.ExpenseWhereInput = {};
    if (branch) where.branch = branch as Branch;
    if (category && EXPENSE_CATEGORIES.includes(category as ExpenseCategoryValue))
      where.category = category;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const rows = await prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      take: 1000,
    });

    const expenses: ExpenseDTO[] = rows.map(toExpenseDTO);

    const catMap = new Map<ExpenseCategoryValue, number>();
    for (const c of EXPENSE_CATEGORIES) catMap.set(c, 0);
    const branchMap = new Map<BranchValue, number>();
    for (const b of BRANCHES) branchMap.set(b, 0);
    let totalAmount = 0;
    for (const e of expenses) {
      totalAmount = round2(totalAmount + e.amount);
      catMap.set(e.category, round2((catMap.get(e.category) ?? 0) + e.amount));
      branchMap.set(e.branch, round2((branchMap.get(e.branch) ?? 0) + e.amount));
    }

    const payload: ExpensesListResponse = {
      expenses,
      total: expenses.length,
      summary: {
        count: expenses.length,
        totalAmount,
        byCategory: [...catMap.entries()].map(([category, total]) => ({
          category,
          total,
        })),
        byBranch: [...branchMap.entries()].map(([branch, total]) => ({
          branch,
          total,
        })),
      },
    };
    return ok(payload, 200, CACHE_NONE);
  } catch (error) {
    return handleServerError(error);
  }
}

// POST /api/expenses — تسجيل مصروف
export async function POST(req: Request) {
  try {
    const input = parseExpenseInput(await req.json());
    if (MOCK_MODE) return ok(mockCreateExpense(input), 201);

    const created = await prisma.expense.create({
      data: {
        branch: input.branch as Branch,
        category: input.category,
        amount: input.amount,
        description: input.description,
        date: input.date ? new Date(input.date) : new Date(),
        createdBy: input.createdBy,
      },
    });

    await prisma.activityLog.create({
      data: {
        userName: input.createdBy || "النظام",
        userRole: "ADMIN",
        action: "تسجيل مصروف",
        details: `${input.amount} ج.م — ${input.description ?? input.category}`,
      },
    });

    return ok(toExpenseDTO(created), 201);
  } catch (error) {
    if (error instanceof ValidationError) return fail(error.message, 422);
    return handleServerError(error);
  }
}
