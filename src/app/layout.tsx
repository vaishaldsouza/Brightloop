import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brightloop Subscriptions",
  description: "B2B Subscription Management & Invoicing System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-surface" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var clean = function(node) {
                    if (node && node.removeAttribute) {
                      if (node.hasAttribute('fdprocessedid')) node.removeAttribute('fdprocessedid');
                    }
                    if (node && node.querySelectorAll) {
                      var list = node.querySelectorAll('[fdprocessedid]');
                      for (var i = 0; i < list.length; i++) list[i].removeAttribute('fdprocessedid');
                    }
                  };
                  var obs = new MutationObserver(function(muts) {
                    for (var i = 0; i < muts.length; i++) {
                      var m = muts[i];
                      if (m.type === 'attributes' && m.attributeName === 'fdprocessedid') {
                        if (m.target && m.target.removeAttribute) m.target.removeAttribute('fdprocessedid');
                      } else if (m.type === 'childList') {
                        for (var j = 0; j < m.addedNodes.length; j++) clean(m.addedNodes[j]);
                      }
                    }
                  });
                  obs.observe(document.documentElement, {
                    attributes: true,
                    childList: true,
                    subtree: true,
                    attributeFilter: ['fdprocessedid']
                  });
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans text-on-surface bg-surface antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
