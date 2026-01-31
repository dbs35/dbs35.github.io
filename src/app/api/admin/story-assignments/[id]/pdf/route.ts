import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CONFIG } from "@/lib/config";
import { extractText } from "unpdf";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function parsePdf(data: Uint8Array): Promise<string> {
  const { text } = await extractText(data);
  // text is an array of strings (one per page), join them
  return Array.isArray(text) ? text.join("\n") : text;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const email = formData.get("email") as string;
    const file = formData.get("pdf") as File | null;

    if (!email || email.toLowerCase() !== CONFIG.adminEmail.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Verify the story assignment exists and is active
    const assignment = await prisma.storyAssignment.findFirst({
      where: { id, active: true },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Story assignment not found" },
        { status: 404 }
      );
    }

    // Read file as Uint8Array and extract text
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    let extractedText: string;
    try {
      extractedText = await parsePdf(data);
    } catch (parseError) {
      console.error("PDF parsing error:", parseError);
      return NextResponse.json(
        { error: "Failed to parse PDF. Please ensure it's a valid PDF file." },
        { status: 400 }
      );
    }

    // Update the story assignment with the extracted text
    const updated = await prisma.storyAssignment.update({
      where: { id },
      data: {
        backgroundInfo: extractedText,
        pdfFileName: file.name,
      },
    });

    return NextResponse.json({
      success: true,
      pdfFileName: updated.pdfFileName,
      textLength: extractedText.length,
    });
  } catch (error) {
    console.error("Error uploading PDF:", error);
    return NextResponse.json(
      { error: "Failed to upload PDF" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = request.nextUrl.searchParams.get("email");

    if (!email || email.toLowerCase() !== CONFIG.adminEmail.toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the story assignment exists
    const assignment = await prisma.storyAssignment.findFirst({
      where: { id, active: true },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Story assignment not found" },
        { status: 404 }
      );
    }

    // Clear the PDF data
    await prisma.storyAssignment.update({
      where: { id },
      data: {
        backgroundInfo: null,
        pdfFileName: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting PDF:", error);
    return NextResponse.json(
      { error: "Failed to delete PDF" },
      { status: 500 }
    );
  }
}
