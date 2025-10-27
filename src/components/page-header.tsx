"use client";

import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

type Crumb = { href: string; label: string };

export function PageHeader({
  items,
  showSidebarTrigger = true,
}: {
  items: Crumb[];
  showSidebarTrigger?: boolean;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        {showSidebarTrigger ? <SidebarTrigger className="-ml-1" /> : null}
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {items.map((item, index) => (
              <React.Fragment key={`${item.href}-${index}`}>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                </BreadcrumbItem>
                {index < items.length - 1 ? (
                  <BreadcrumbSeparator className="hidden md:block" />
                ) : null}
              </React.Fragment>
            ))}
            <BreadcrumbItem className="md:hidden block">
              <BreadcrumbPage>{items[items.length - 1]?.label}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
