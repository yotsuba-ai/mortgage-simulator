"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formDataToObject, propertySchema, toFieldErrors, type FormState } from "@/lib/validation";

export async function saveProperty(id: number | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const values = formDataToObject(formData);
  const parsed = propertySchema.safeParse(values);
  if (!parsed.success) {
    return { errors: toFieldErrors(parsed.error), values };
  }
  const data = parsed.data;
  let savedId: number;
  if (id == null) {
    const created = await prisma.property.create({ data });
    savedId = created.id;
  } else {
    await prisma.property.update({ where: { id }, data });
    savedId = id;
  }
  revalidatePath("/");
  revalidatePath("/properties");
  revalidatePath(`/properties/${savedId}`);
  redirect(`/properties/${savedId}`);
}

export async function deleteProperty(id: number): Promise<void> {
  await prisma.property.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/properties");
  redirect("/properties");
}
