using System.Collections.Generic;
using System.Threading.Tasks;

namespace ReelRoulette;

public interface ITagMutationClient
{
    Task<CoreTagEditorModelResponse?> GetTagEditorModelAsync(List<string> itemIds);
    Task<bool> UpsertCategoryAsync(TagCategory category);
    Task<bool> DeleteCategoryAsync(string categoryId, string? newCategoryId);
    Task<bool> UpsertTagAsync(string tagName, string categoryId);
    Task<bool> RenameTagAsync(string oldTagName, string newTagName, string? newCategoryId);
    Task<bool> DeleteTagAsync(string tagName);
    Task<bool> ApplyItemTagDeltaAsync(List<string> itemIds, List<string> addTags, List<string> removeTags);
}
