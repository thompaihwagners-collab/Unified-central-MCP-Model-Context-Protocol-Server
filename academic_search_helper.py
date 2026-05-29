import sys
import json
import argparse
from pathlib import Path

# Add academic search mcp-server to sys.path
mcp_server_path = Path("F:/fcpaper/nature-skills/skills/nature-academic-search/mcp-server")
sys.path.append(str(mcp_server_path))

from sources import ArxivSource, CrossRefSource, PubMedSource
from utils import AcademicSearchError, DataSourceError

# Instantiate sources
_crossref = CrossRefSource()
_pubmed = PubMedSource()
_arxiv = ArxivSource()

def _detect_id_type(id_val):
    id_val = id_val.strip()
    if id_val.startswith("10.") and "/" in id_val:
        return "doi"
    import re
    if re.match(r"^\d{7,8}$", id_val):
        return "pmid"
    if re.match(r"^\d{4}\.\d{4,5}(v\d+)?$", id_val):
        return "arxiv"
    raise ValueError(f"Cannot detect ID type for: {id_val}")

def _resolve_id_type(id_val, id_type):
    if id_type == "auto":
        return _detect_id_type(id_val)
    normalised = id_type.lower().strip()
    if normalised in ("doi", "pmid", "arxiv"):
        return normalised
    raise ValueError(f"Unsupported id_type: {id_type}")

def _format_basic_citation(paper, style):
    authors = paper.get("authors", [])
    title = paper.get("title", "Untitled")
    year = paper.get("year", "n.d.")
    journal = paper.get("journal", "")
    doi = paper.get("doi", "")
    arxiv_id = paper.get("arxiv_id", "")
    pmid = paper.get("pmid", "")

    if len(authors) > 3:
        author_str = f"{authors[0]} et al."
    elif authors:
        author_str = ", ".join(authors)
    else:
        author_str = "Unknown"

    if style == "nature":
        parts = [f"{author_str}. {title}."]
        if journal:
            parts.append(f" *{journal}*.")
        if year:
            parts.append(f" ({year}).")
        if doi:
            parts.append(f" https://doi.org/{doi}")
        return "".join(parts)

    if style == "ieee":
        ref = f"{author_str}, \"{title}\""
        if journal:
            ref += f", *{journal}*"
        if year:
            ref += f", {year}"
        ref += "."
        if doi:
            ref += f" doi: {doi}."
        return ref

    parts = [f"{author_str} ({year}). {title}."]
    if journal:
        parts.append(f" *{journal}*.")
    if doi:
        parts.append(f" https://doi.org/{doi}")
    elif arxiv_id:
        parts.append(f" arXiv:{arxiv_id}")
    elif pmid:
        parts.append(f" PMID:{pmid}")
    return "".join(parts)

def search_papers(query, sources, rows, filter_type):
    import asyncio
    
    async def _search_crossref(q, r, ft):
        return _crossref.search(q, r, ft)

    async def _search_pubmed(q, r):
        return _pubmed.search(q, r)

    async def _search_arxiv(q, r):
        return _arxiv.search(q, r)

    async def _search_all():
        tasks = []
        source_order = []
        if "crossref" in sources:
            tasks.append(_search_crossref(query, rows, filter_type))
            source_order.append("crossref")
        if "pubmed" in sources:
            tasks.append(_search_pubmed(query, rows))
            source_order.append("pubmed")
        if "arxiv" in sources:
            tasks.append(_search_arxiv(query, rows))
            source_order.append("arxiv")

        if not tasks:
            return {"total": 0, "results": [], "errors": []}

        outcomes = await asyncio.gather(*tasks, return_exceptions=True)

        merged_results = []
        errors = []
        total = 0

        for src, outcome in zip(source_order, outcomes):
            if isinstance(outcome, BaseException):
                errors.append({"source": src, "error": str(outcome)})
                continue
            total += outcome.get("total", 0)
            merged_results.extend(outcome.get("results", []))

        return {
            "total": total,
            "sources_queried": source_order,
            "result_count": len(merged_results),
            "results": merged_results,
            "errors": errors if errors else None,
        }

    return asyncio.run(_search_all())

def main():
    parser = argparse.ArgumentParser(description="Academic Search Helper Wrapper")
    parser.add_argument("--action", required=True, choices=["search_papers", "get_paper_by_id", "get_citation", "lookup_mesh"])
    parser.add_argument("--query", default="")
    parser.add_argument("--sources", default="crossref,pubmed,arxiv")
    parser.add_argument("--rows", type=int, default=5)
    parser.add_argument("--filter-type", default=None)
    parser.add_argument("--id", default="")
    parser.add_argument("--id-type", default="auto")
    parser.add_argument("--style", default="apa")
    parser.add_argument("--term", default="")
    
    args = parser.parse_args()
    
    try:
        if args.action == "search_papers":
            srcs = [s.strip() for s in args.sources.split(",") if s.strip()]
            res = search_papers(args.query, srcs, args.rows, args.filter_type)
            print(json.dumps(res, ensure_ascii=False, indent=2))
            
        elif args.action == "get_paper_by_id":
            resolved_type = _resolve_id_type(args.id, args.id_type)
            if resolved_type == "doi":
                res = _crossref.get_by_doi(args.id.strip())
            elif resolved_type == "pmid":
                res = _pubmed.get_by_pmid(args.id.strip())
            elif resolved_type == "arxiv":
                res = _arxiv.get_by_id(args.id.strip())
            else:
                res = {"error": f"Unsupported ID type: {resolved_type}"}
            print(json.dumps(res, ensure_ascii=False, indent=2))
            
        elif args.action == "get_citation":
            resolved_type = _resolve_id_type(args.id, args.id_type)
            if resolved_type == "doi":
                citation = _crossref.get_citation(args.id.strip(), style=args.style)
            else:
                if resolved_type == "pmid":
                    paper = _pubmed.get_by_pmid(args.id.strip())
                elif resolved_type == "arxiv":
                    paper = _arxiv.get_by_id(args.id.strip())
                citation = _format_basic_citation(paper, args.style)
            res = {"id": args.id, "style": args.style, "citation": citation}
            print(json.dumps(res, ensure_ascii=False, indent=2))
            
        elif args.action == "lookup_mesh":
            res = _pubmed.lookup_mesh(args.term.strip())
            print(json.dumps(res, ensure_ascii=False, indent=2))
            
    except DataSourceError as exc:
        print(json.dumps({"error": str(exc), "source": getattr(exc, "source", None)}, ensure_ascii=False, indent=2))
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"error": f"Unexpected error: {exc}"}, ensure_ascii=False, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
