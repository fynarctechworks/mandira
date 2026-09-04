"use client";

import { Badge } from "@mandhira/ui/components/ui/badge";
import { Button } from "@mandhira/ui/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@mandhira/ui/components/ui/button-group";
import { Kbd, KbdGroup } from "@mandhira/ui/components/ui/kbd";
import { Marker, MarkerContent, MarkerIcon } from "@mandhira/ui/components/ui/marker";
import { Spinner } from "@mandhira/ui/components/ui/spinner";
import { Toggle } from "@mandhira/ui/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@mandhira/ui/components/ui/toggle-group";
import {
  ArrowRightIcon,
  BellIcon,
  BoldIcon,
  CheckIcon,
  ItalicIcon,
  StarIcon,
  UnderlineIcon,
} from "lucide-react";
import { Section, Specimen } from "./shell";

const BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;
const BADGE_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

export function Actions() {
  return (
    <Section
      id="actions"
      title="Actions"
      summary="Button, ButtonGroup, Toggle, ToggleGroup, Badge, Marker, Kbd and Spinner — the preset's sizing taken as shipped."
    >
      <Specimen name="Button — variants">
        {BUTTON_VARIANTS.map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
      </Specimen>

      <Specimen name="Button — sizes" note="Preset heights: 24 / 28 / 32 / 36px">
        {BUTTON_SIZES.map((s) => (
          <Button key={s} size={s}>
            {s}
          </Button>
        ))}
      </Specimen>

      <Specimen name="Button — icons, icon-only and states">
        <Button>
          <StarIcon data-icon="inline-start" />
          Leading
        </Button>
        <Button variant="secondary">
          Trailing
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
        <Button size="icon" aria-label="Notifications">
          <BellIcon />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="Confirm">
          <CheckIcon />
        </Button>
        <Button disabled>Disabled</Button>
        <Button variant="outline" disabled>
          <Spinner />
          Working
        </Button>
      </Specimen>

      <Specimen name="ButtonGroup">
        <ButtonGroup>
          <Button variant="outline">Day</Button>
          <Button variant="outline">Week</Button>
          <Button variant="outline">Month</Button>
        </ButtonGroup>
        <ButtonGroup>
          <ButtonGroupText>Sort</ButtonGroupText>
          <ButtonGroupSeparator />
          <Button variant="outline">Time</Button>
          <Button variant="outline">Distance</Button>
        </ButtonGroup>
        <ButtonGroup orientation="vertical">
          <Button variant="outline">Top</Button>
          <Button variant="outline">Bottom</Button>
        </ButtonGroup>
      </Specimen>

      <Specimen name="Toggle & ToggleGroup">
        <Toggle aria-label="Bold">
          <BoldIcon />
        </Toggle>
        <Toggle variant="outline" aria-label="Italic">
          <ItalicIcon />
        </Toggle>
        <ToggleGroup>
          <ToggleGroupItem value="bold" aria-label="Bold">
            <BoldIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="italic" aria-label="Italic">
            <ItalicIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="underline" aria-label="Underline">
            <UnderlineIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      </Specimen>

      <Specimen name="Badge">
        {BADGE_VARIANTS.map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </Specimen>

      <Specimen name="Marker" note="Inline annotation, used to mark a value as changed or noteworthy">
        <Marker>
          <MarkerIcon>
            <StarIcon />
          </MarkerIcon>
          <MarkerContent>Default</MarkerContent>
        </Marker>
        <Marker variant="border">
          <MarkerContent>Border</MarkerContent>
        </Marker>
        <Marker variant="separator">
          <MarkerContent>Separator</MarkerContent>
        </Marker>
      </Specimen>

      <Specimen name="Kbd & Spinner">
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
        <Kbd>Esc</Kbd>
        <Spinner />
        <Spinner className="size-6 text-primary" />
      </Specimen>
    </Section>
  );
}
