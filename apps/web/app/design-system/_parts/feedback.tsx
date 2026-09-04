"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@mandhira/ui/components/ui/alert";
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@mandhira/ui/components/ui/attachment";
import { Bubble, BubbleContent, BubbleGroup } from "@mandhira/ui/components/ui/bubble";
import { Button } from "@mandhira/ui/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@mandhira/ui/components/ui/carousel";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@mandhira/ui/components/ui/combobox";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageGroup,
} from "@mandhira/ui/components/ui/message";
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireItem,
  QuestionnaireProgress,
  QuestionnaireTitle,
} from "@mandhira/ui/components/ui/questionnaire";
import { Toaster as SonnerToaster } from "@mandhira/ui/components/ui/sonner";
import { Toaster, toast } from "@mandhira/ui/components/ui/toast";
import { FileTextIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { toast as sonner } from "sonner";
import { Section, Specimen } from "./shell";

const PLACES = ["Varanasi", "Ayodhya", "Prayagraj", "Chitrakoot", "Gaya"];

export function Feedback() {
  return (
    <Section
      id="feedback"
      title="Feedback & content"
      summary="Alert, Toast, Sonner, Message, Bubble, Attachment, Carousel, Combobox and Questionnaire."
    >
      <Specimen name="Alert" className="block space-y-3">
        <Alert>
          <InfoIcon />
          <AlertTitle>The temple changed its closing time</AlertTitle>
          <AlertDescription>
            Day 3 is affected, because your darshan sits inside the window that is now closed.
          </AlertDescription>
          <AlertAction>
            <Button size="xs" variant="outline">
              Review
            </Button>
          </AlertAction>
        </Alert>
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Day 4 cannot work as planned</AlertTitle>
          <AlertDescription>
            The drive is 7 hours and the last entry is at 4 pm.
          </AlertDescription>
        </Alert>
      </Specimen>

      <Specimen name="Toast" note="Base UI toast manager">
        <Toaster />
        <Button
          variant="outline"
          onClick={() =>
            toast.add({
              title: "Saved offline",
              description: "This journey is available without a connection.",
            })
          }
        >
          Show toast
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.add({
              type: "success",
              title: "Published",
              description: "Travellers can see this now.",
            })
          }
        >
          Success toast
        </Button>
      </Specimen>

      <Specimen name="Sonner" note="The preset also ships the Sonner-backed Toaster">
        <SonnerToaster />
        <Button variant="outline" onClick={() => sonner("Change card dismissed")}>
          Show sonner
        </Button>
      </Specimen>

      <Specimen name="Message & Bubble" className="block">
        <MessageGroup className="space-y-3">
          <Message>
            <MessageAvatar>M</MessageAvatar>
            <MessageContent>
              <BubbleGroup>
                <Bubble>
                  <BubbleContent>
                    Day 3 is tight. Moving Sarnath to the afternoon gives you an hour back.
                  </BubbleContent>
                </Bubble>
              </BubbleGroup>
            </MessageContent>
          </Message>
          <Message align="end">
            <MessageContent>
              <BubbleGroup>
                <Bubble align="end">
                  <BubbleContent>Keep as is.</BubbleContent>
                </Bubble>
              </BubbleGroup>
            </MessageContent>
          </Message>
        </MessageGroup>
      </Specimen>

      <Specimen name="Attachment" className="block">
        <AttachmentGroup>
          <Attachment>
            <AttachmentMedia>
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>temple-trust-notice.pdf</AttachmentTitle>
              <AttachmentDescription>Tier 1 · retrieved 3 days ago</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
          <Attachment>
            <AttachmentMedia>
              <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>route-timings.csv</AttachmentTitle>
              <AttachmentDescription>Tier 3 · aging</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        </AttachmentGroup>
      </Specimen>

      <Specimen name="Carousel" className="block">
        <Carousel className="mx-auto w-full max-w-md">
          <CarouselContent>
            {PLACES.map((p) => (
              <CarouselItem key={p} className="basis-1/2">
                <div className="flex h-24 items-center justify-center rounded-md border border-border bg-card text-sm">
                  {p}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </Specimen>

      <Specimen name="Combobox" className="block">
        <Combobox items={PLACES}>
          <ComboboxInput placeholder="Search a destination" className="w-72" aria-label="Search a destination" />
          <ComboboxContent>
            <ComboboxEmpty>Nothing found.</ComboboxEmpty>
            <ComboboxList>
              {(place: string) => (
                <ComboboxItem key={place} value={place}>
                  {place}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Specimen>

      <Specimen name="Questionnaire" note="Drives the intake that sets priority tiers" className="block">
        <Questionnaire items={[{ name: "pace" }]}>
          <QuestionnaireProgress />
          <QuestionnaireItem name="pace">
            <QuestionnaireTitle>How should the days feel?</QuestionnaireTitle>
            <QuestionnaireDescription>
              This sets the pace check, and you can change it at any time.
            </QuestionnaireDescription>
            <QuestionnaireChoices>
              <QuestionnaireChoice value="unhurried">Unhurried</QuestionnaireChoice>
              <QuestionnaireChoice value="balanced">Balanced</QuestionnaireChoice>
              <QuestionnaireChoice value="full">As full as it can be</QuestionnaireChoice>
            </QuestionnaireChoices>
          </QuestionnaireItem>
        </Questionnaire>
      </Specimen>
    </Section>
  );
}
